// HTTP smoke test for resource management against a running app, including server
// actions replayed directly by a non-admin (bypassing the UI).
//
// It creates, edits and deactivates a resource, so it must run against a server that
// uses a disposable, seeded database, never your demo data. In Git Bash:
//   set -a; . ./.env; set +a
//   DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed
//   npm run build && DATABASE_URL="$TEST_DATABASE_URL" npx next start -p 3001   (another terminal)
//   npm run smoke:resources -- http://localhost:3001
// (A production server can run alongside your normal "npm run dev" on port 3000.)
import { actionFields, check, finish, get, login, submit, textPattern } from "./smoke-lib.mjs";

if (!process.argv[2]) {
  console.log("Pass the URL of a server that uses a disposable test database, e.g. npm run smoke:resources -- http://localhost:3001");
  process.exit(1);
}

const INACTIVE_ID = "00000000-0000-4000-a000-000000000006"; // seeded "Old Conference Room"
const BOARD_ROOM_ID = "00000000-0000-4000-a000-000000000001"; // seeded, has upcoming bookings
const name = `Smoke Test Room ${Date.now()}`;

const admin = await login("admin@rrms.local");
const user = await login("user@rrms.local");

// Browsing and visibility
const userList = await get("/resources?status=all", user);
check("user sees active resources", userList.body.includes("Board Room A"));
check("user never sees inactive resources, even with ?status=all", !userList.body.includes("Old Conference Room"));
check("user gets no Add resource button", !userList.body.includes("Add resource"));

const filtered = await get("/resources?type=VEHICLE", user);
check("type filter narrows the list", filtered.body.includes("Toyota HiAce Van") && !filtered.body.includes("Board Room A"));
const searched = await get("/resources?q=east%20wing", user);
check("search matches location case-insensitively", searched.body.includes("Board Room A") && !searched.body.includes("Toyota HiAce Van"));
const empty = await get("/resources?q=no-such-resource", user);
check("no matches shows an empty state", empty.body.includes("No resources match these filters."));

check("user gets not-found for an inactive resource", (await get(`/resources/${INACTIVE_ID}`, user)).body.includes("This page or resource does not exist"));
check("malformed resource ID is not-found, not a server error", (await get("/resources/not-a-uuid", user)).body.includes("This page or resource does not exist"));
check("admin sees inactive resources with status=inactive", (await get("/resources?status=inactive", admin)).body.includes("Old Conference Room"));

const details = await get(`/resources/${BOARD_ROOM_ID}`, user);
check("details show capacity and location", details.body.includes("Level 3, East Wing") && />12</.test(details.body));
check("details label the Asia/Colombo time zone", details.body.includes("Times shown in Asia/Colombo (UTC+05:30)"));
check("details mark the user's own booking", details.body.includes("Your booking"));
check("details hide other bookers' identity and purpose from users", !details.body.includes("Vendor review"));
const adminDetails = await get(`/resources/${BOARD_ROOM_ID}`, admin);
check("admins see who booked and why", adminDetails.body.includes("Vendor review"));

// Admin-only pages
check("user is denied the create page", (await get("/resources/new", user)).body.includes("Access denied"));
check("user is denied the edit page", (await get(`/resources/${BOARD_ROOM_ID}/edit`, user)).body.includes("Access denied"));

// Create: validation, then success
const newPage = await get("/resources/new", admin);
const createFields = actionFields(newPage.body, "Create resource</button>");
const invalid = await submit("/resources/new", createFields, { name: "  ", type: "LAB", location: "Lab Block", capacity: "0" }, admin);
check("server rejects blank name", invalid.body.includes("Name is required."));
check("server rejects capacity 0", invalid.body.includes("Capacity must be at least 1."));

// A regular user replays the admin's create action directly.
const forged = await submit("/resources/new", createFields, { name: `${name} (forged)`, type: "LAB", location: "Lab Block", capacity: "5" }, user);
check("non-admin replaying the create action is refused", forged.body.includes("Only administrators can do this.") && forged.status !== 303);

const created = await submit("/resources/new", createFields, { name, type: "LAB", location: "Lab Block", capacity: "8" }, admin);
const newId = created.location?.match(/\/resources\/([0-9a-f-]{36})$/)?.[1];
check("admin creates a resource and is redirected to it", created.status === 303 && Boolean(newId), `HTTP ${created.status} ${created.location}`);
// Look for a result card heading; the search box itself echoes the query text.
const forgedSearch = await get(`/resources?q=${encodeURIComponent("(forged)")}&status=all`, admin);
check("forged resource was not created", forgedSearch.body.includes("No resources match these filters.") && !forgedSearch.body.includes(`>${name} (forged)</h2>`));

// Edit: a user replaying the bound update action is refused; the admin succeeds.
const editPage = await get(`/resources/${newId}/edit`, admin);
const editFields = actionFields(editPage.body, "Save changes</button>");
const forgedEdit = await submit(`/resources/${newId}/edit`, editFields, { name: "Hijacked", type: "LAB", location: "x", capacity: "1" }, user);
check("non-admin replaying the update action is refused", forgedEdit.body.includes("Only administrators can do this."));
const edited = await submit(`/resources/${newId}/edit`, editFields, { name, type: "LAB", location: "Lab Block, Room 4", capacity: "9" }, admin);
check("admin edit redirects back to the resource", edited.status === 303 && edited.location === `/resources/${newId}`);
const afterEdit = await get(`/resources/${newId}`, admin);
check("edit is saved", afterEdit.body.includes("Lab Block, Room 4") && !afterEdit.body.includes("Hijacked"));

// Deactivate: a user replaying the toggle is refused; the admin succeeds.
const toggleFields = actionFields(afterEdit.body, "Deactivate</button>");
const forgedToggle = await submit(`/resources/${newId}`, toggleFields, {}, user);
check("non-admin replaying deactivate is refused", forgedToggle.body.includes("Only administrators can do this."));
const deactivated = await submit(`/resources/${newId}`, toggleFields, {}, admin);
check("admin deactivate redirects back to the resource", deactivated.status === 303 && deactivated.location === `/resources/${newId}`, `HTTP ${deactivated.status}`);
const afterToggle = await get(`/resources/${newId}`, admin);
check("admin deactivation takes effect", textPattern("This resource is inactive.").test(afterToggle.body) && afterToggle.body.includes("Reactivate"));
check("deactivated resource disappears for users", (await get(`/resources/${newId}`, user)).body.includes("This page or resource does not exist"));

finish("resource");
