// Shared helpers for the HTTP smoke tests. They submit server-action forms the way a
// browser without JavaScript does (progressive enhancement), so the server's own
// validation and authorization are what get tested, not client-side code.

export const BASE = process.argv[2] ?? "http://localhost:3000";
export const DEMO_PASSWORD = "Demo@12345";

let failures = 0;

export function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}

export function finish(name) {
  console.log(failures === 0 ? `\nAll ${name} smoke checks passed.` : `\n${failures} check(s) failed.`);
  process.exitCode = failures ? 1 : 0;
}

const decode = (s) => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

/**
 * Collects the hidden server-action fields of the form that contains `marker`
 * (e.g. its submit button label), so a specific form can be replayed.
 */
export function actionFields(html, marker) {
  const end = marker ? html.indexOf(marker) : html.length;
  const start = html.lastIndexOf("<form", end);
  const formHtml = start === -1 ? "" : html.slice(start, end);
  const fields = new FormData();
  for (const [, name, value = ""] of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) {
    fields.append(decode(name), decode(value));
  }
  return fields;
}

/**
 * Collects the hidden server-action fields of the form whose bound arguments contain
 * `value` (e.g. a reservation ID). Client-component forms are streamed out of order, so
 * a form cannot be located by its position relative to the visible text.
 */
export function actionFieldsWithBoundValue(html, value) {
  for (const match of html.matchAll(/<input type="hidden" name="\$ACTION_[^"]*" value="([^"]*)"\/>/g)) {
    if (decode(match[1]).includes(value)) {
      const start = html.lastIndexOf("<form", match.index);
      const end = html.indexOf("</form>", match.index);
      return actionFields(html.slice(start, end));
    }
  }
  return new FormData();
}

export async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), body: res.status === 200 ? await res.text() : "" };
}

/** Replays a form's server action with the given fields as `cookie`'s user. */
export async function submit(path, fields, values, cookie) {
  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  for (const [key, value] of Object.entries(values)) form.append(key, String(value));
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form, headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), setCookie: res.headers.get("set-cookie") ?? "", body: await res.text() };
}

export async function submitLogin(email, password) {
  const { body } = await get("/login");
  return submit("/login", actionFields(body, "Sign in</button>"), { email, password });
}

/** Signs in and returns the session cookie, or exits if login fails. */
export async function login(email, password = DEMO_PASSWORD) {
  const res = await submitLogin(email, password);
  const cookie = res.setCookie.match(/rrms_session=[^;]+/)?.[0];
  if (!cookie) {
    console.log(`Login as ${email} failed (HTTP ${res.status}); is the database seeded (npm run db:seed)?`);
    process.exit(1);
  }
  return cookie;
}

/** React separates adjacent text with <!-- --> in server-rendered HTML. */
export const textPattern = (...parts) => new RegExp(parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(<!-- -->)?"));
