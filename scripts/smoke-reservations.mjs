// HTTP smoke test for bookings against a running app. It replays the booking and
// cancel server actions directly (no client JavaScript), so it checks the rules the
// server enforces when requests bypass the UI, including two simultaneous requests.
//
// It writes data, so run it only against a server that uses the disposable test
// database (see smoke-resources.mjs for the commands), e.g.
//   npm run smoke:reservations -- http://localhost:3001
import { actionFields, actionFieldsWithBoundValue, check, finish, get, login, submit } from "./smoke-lib.mjs";

if (!process.argv[2]) {
  console.log("Pass the URL of a server that uses a disposable test database, e.g. npm run smoke:reservations -- http://localhost:3001");
  process.exit(1);
}

const BOARD_ROOM_ID = "00000000-0000-4000-a000-000000000001";
const INACTIVE_ID = "00000000-0000-4000-a000-000000000006";
const run = Date.now().toString(36);

// A unique future day per run (Asia/Colombo), so repeated runs don't collide.
const colomboDate = (offsetDays) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date(Date.now() + offsetDays * 86_400_000));
const day = colomboDate(30 + (Date.now() % 300));
const at = (time) => `${day}T${time}`;

const user = await login("user@rrms.local");
const user2 = await login("user2@rrms.local");
const admin = await login("admin@rrms.local");

const newPage = await get(`/reservations/new?resourceId=${BOARD_ROOM_ID}`, user);
check("booking form shows the Asia/Colombo time zone", newPage.body.includes("Times are in Asia/Colombo (UTC+05:30)"));
const bookFields = actionFields(newPage.body, ">Book</button>");
const bookAs = (cookie, values) => submit("/reservations/new", bookFields, { resourceId: BOARD_ROOM_ID, ...values }, cookie);

// Create
const first = await bookAs(user, { start: at("09:00"), end: at("10:00"), purpose: `smoke-${run}-A` });
check("booking redirects with a confirmation", first.status === 303 && first.location === "/reservations?notice=booked", `HTTP ${first.status} ${first.location}`);
const mine = await get("/reservations?notice=booked", user);
check("booking appears under My bookings", mine.body.includes(`smoke-${run}-A`) && mine.body.includes("Booking confirmed."));

// Availability view reflects the booking (RRMS-06)
const dayView = (cookie) => get(`/resources/${BOARD_ROOM_ID}?date=${day}&view=day`, cookie);
// Only look inside that day's availability section: the page's "Upcoming bookings" list
// can contain other bookings with the same times (e.g. the seeded 09:00–10:00 booking).
const daySection = (html) => {
  const i = html.indexOf(`<section aria-labelledby="day-${day}"`);
  return i === -1 ? "" : html.slice(i, html.indexOf("</section>", i));
};
const bookedRow = (html, label) => new RegExp(`09:00–10:00</span><span[^>]*>${label}<`).test(daySection(html));
const forOwner = (await dayView(user)).body;
check("availability shows the new booking as 'Your booking' for its owner", bookedRow(forOwner, "Your booking"));
const forOther = (await dayView(user2)).body;
check("availability shows it as 'Booked' (no name) for other users", bookedRow(forOther, "Booked") && !forOther.includes("Booked by Demo User"));
const week = (await get(`/resources/${BOARD_ROOM_ID}?date=${day}&view=week`, user)).body;
check("week view lists seven days", (week.match(/<section aria-labelledby="day-/g) ?? []).length === 7);
const bookLink = forOther.match(/href="(\/reservations\/new\?resourceId=[^"]+&amp;start=[^"]+&amp;end=[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
check("free periods offer a prefilled Book link", Boolean(bookLink));
const prefilled = bookLink ? (await get(bookLink, user2)).body : "";
const linkStart = bookLink ? new URL(bookLink, "http://x").searchParams.get("start") : null;
check("Book link opens the form with that slot filled in", Boolean(linkStart) && prefilled.includes(`value="${linkStart}"`));

// Conflicts and boundaries
const overlap = await bookAs(user2, { start: at("09:30"), end: at("10:30"), purpose: `smoke-${run}-overlap` });
check("overlapping booking by another user gets the conflict message", overlap.body.includes("Board Room A is already booked for part of that time") && overlap.status !== 303);
check("conflict message does not reveal the other booking's purpose", !overlap.body.includes(`smoke-${run}-A`));
const adjacent = await bookAs(user2, { start: at("10:00"), end: at("11:00"), purpose: `smoke-${run}-B` });
check("back-to-back booking is accepted", adjacent.status === 303);

const past = await bookAs(user, { start: "2020-01-01T09:00", end: "2020-01-01T10:00" });
check("past start is rejected", past.body.includes("The start must be in the future."));
const reversed = await bookAs(user, { start: at("15:00"), end: at("14:00") });
check("end before start is rejected", reversed.body.includes("End must be after the start."));
const inactive = await submit("/reservations/new", bookFields, { resourceId: INACTIVE_ID, start: at("09:00"), end: at("10:00") }, user);
check("inactive resource is rejected", inactive.body.includes("This resource is inactive and cannot be booked."));

// Forged owner: user2 submits user's ID; the booking must belong to user2.
const userId = mine.body.match(/"userId":"([0-9a-f-]{36})"/)?.[1] ?? "00000000-0000-4000-8000-000000000000";
const forged = await bookAs(user2, { start: at("12:00"), end: at("13:00"), purpose: `smoke-${run}-forged`, userId, status: "CANCELLED" });
check("a submitted userId/status is ignored (booking still created)", forged.status === 303);
check("forged booking is not attributed to the other user", !(await get("/reservations", user)).body.includes(`smoke-${run}-forged`));
check("forged booking belongs to the submitter", (await get("/reservations", user2)).body.includes(`smoke-${run}-forged`));

// Anonymous replay of the booking action
const anonymous = await bookAs(undefined, { start: at("16:00"), end: at("17:00"), purpose: `smoke-${run}-anon` });
check("anonymous booking attempt is refused", anonymous.body.includes("Please sign in to continue.") && anonymous.status !== 303);

// Two simultaneous requests for the same slot from different users
const [raceA, raceB] = await Promise.all([
  bookAs(user, { start: at("18:00"), end: at("19:00"), purpose: `smoke-${run}-race-user` }),
  bookAs(user2, { start: at("18:00"), end: at("19:00"), purpose: `smoke-${run}-race-user2` }),
]);
const winners = [raceA, raceB].filter((r) => r.status === 303).length;
const losers = [raceA, raceB].filter((r) => r.body.includes("is already booked for part of that time")).length;
check("two simultaneous requests: exactly one succeeds, the other gets the conflict", winners === 1 && losers === 1, `winners ${winners}, conflicts ${losers}`);

// Cancellation and ownership
const userList = (await get("/reservations", user)).body;
// The streamed React payload links each card's text to its cancel button's reservationId.
// Only accept an ID within a short window of the text: that is the payload entry for this
// exact card (the visible HTML copy of the text is not followed by any reservationId).
const reservationId = userList.match(new RegExp(`smoke-${run}-A[\\s\\S]{0,300}?reservationId\\\\*":\\\\*"([0-9a-f-]{36})`))?.[1];
check("booking A's cancel button is found", Boolean(reservationId));
const cancelFields = actionFieldsWithBoundValue(userList, reservationId ?? "missing");
const forgedCancel = await submit("/reservations", cancelFields, {}, user2);
check("another user replaying the cancel action is refused", forgedCancel.body.includes("You can only manage your own reservations."));
const cancelled = await submit("/reservations", cancelFields, {}, user);
check("owner cancel redirects with a notice", cancelled.status === 303 && cancelled.location === "/reservations?notice=cancelled");
const afterCancelOwner = (await dayView(user)).body;
const afterCancelOther = (await dayView(user2)).body;
const slotText = (html) => {
  return daySection(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").match(/\d\d:\d\d–\d\d:\d\d \S+( \S+)?/g)?.slice(0, 3).join(" | ");
};
check(
  "after cancelling, availability no longer shows the slot as booked",
  !bookedRow(afterCancelOwner, "Your booking") && !bookedRow(afterCancelOther, "Booked"),
  `owner: ${slotText(afterCancelOwner)} / other: ${slotText(afterCancelOther)}`,
);
const again = await submit("/reservations", cancelFields, {}, user);
check("cancelling twice is refused", again.body.includes("This booking is already cancelled."));
const rebook = await bookAs(user2, { start: at("09:00"), end: at("10:00"), purpose: `smoke-${run}-rebook` });
check("the cancelled slot can be booked again", rebook.status === 303);
const afterCancel = (await get("/reservations", user)).body;
/** The rendered <li> card whose purpose text is `purpose`. */
const cardFor = (html, purpose) => {
  const at = html.search(new RegExp(`${purpose}(<!-- -->)?</p>`));
  return at === -1 ? "" : html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
};
check("the intended booking is the one cancelled, and it stays in history", cardFor(afterCancel, `smoke-${run}-A`).includes("Cancelled"));
const seeded = cardFor(afterCancel, "Sprint planning");
check("other bookings were not cancelled by mistake", seeded === "" || !seeded.includes("Cancelled"));

// Admin vs user views
const allView = await get("/reservations?view=all", admin);
check("admin All bookings view lists other users' bookings with names", allView.body.includes(`smoke-${run}-rebook`) && allView.body.includes("Second User"));
const userAll = await get("/reservations?view=all", user);
check("users asking for ?view=all still only see their own bookings", userAll.body.includes("My bookings") && !userAll.body.includes(`smoke-${run}-rebook`));

finish("reservation");
