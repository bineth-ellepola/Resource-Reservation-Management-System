// HTTP smoke test for authentication against a running app, submitting the login
// form the way a browser without JavaScript would (server action progressive enhancement).
// It bypasses the UI's client-side code, so it checks what the server itself enforces.
//
// Usage: npm run db:seed && npm run dev   (in another terminal)
//        npm run smoke:auth [-- http://localhost:3000]
const BASE = process.argv[2] ?? "http://localhost:3000";
const ADMIN = { email: "admin@rrms.local", password: "Demo@12345", name: "Demo Admin" };

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}

const decode = (s) => s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
const hiddenInputs = /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g;
const welcome = (name) => new RegExp(`Welcome, (<!-- -->)?${name}`);

async function submitLogin(email, password) {
  const html = await (await fetch(`${BASE}/login`)).text();
  const form = new FormData();
  for (const [, name, value = ""] of html.matchAll(hiddenInputs)) form.append(decode(name), decode(value));
  form.append("email", email);
  form.append("password", password);
  return fetch(`${BASE}/login`, { method: "POST", body: form, redirect: "manual" });
}

async function visit(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  // With partial prerendering the static shell streams first, so a redirect thrown
  // inside the Suspense boundary arrives in the payload instead of as an HTTP 3xx.
  const toLogin = res.headers.get("location")?.endsWith("/login") || /NEXT_REDIRECT;[^;]*;\/login/.test(body);
  return { status: res.status, body, toLogin };
}

const anon = await visit("/dashboard");
check("anonymous /dashboard is sent to /login", anon.toLogin, `HTTP ${anon.status}`);
check("anonymous /dashboard renders no user data", !/Welcome,/.test(anon.body));

const wrong = await submitLogin(ADMIN.email, "not-the-password");
check("wrong password shows the generic error", (await wrong.text()).includes("Invalid email or password."));
check("wrong password sets no session cookie", !(wrong.headers.get("set-cookie") ?? "").includes("rrms_session="));

const unknown = await submitLogin("nobody@rrms.local", ADMIN.password);
check("unknown email shows the same generic error", (await unknown.text()).includes("Invalid email or password."));

const invalidBody = await (await submitLogin("not-an-email", "")).text();
check(
  "server-side validation reports both fields",
  invalidBody.includes("Enter a valid email address.") && invalidBody.includes("Enter your password."),
);

const ok = await submitLogin(ADMIN.email.toUpperCase(), ADMIN.password);
const setCookie = ok.headers.get("set-cookie") ?? "";
const cookie = setCookie.match(/rrms_session=[^;]+/)?.[0];
check("correct login redirects to /dashboard", ok.status === 303 && ok.headers.get("location") === "/dashboard", `HTTP ${ok.status}`);
if (!cookie) {
  console.log("\nLogin failed; is the database seeded (npm run db:seed)?");
  process.exit(1);
}
check("session cookie is HttpOnly", /HttpOnly/i.test(setCookie));
check("session cookie is SameSite=Lax", /SameSite=lax/i.test(setCookie));
check("session cookie expires after 8 hours", /Max-Age=28800/i.test(setCookie));

const dash = await visit("/dashboard", cookie);
check("signed-in /dashboard shows the user and role", welcome(ADMIN.name).test(dash.body) && dash.body.includes("ADMIN"));

const [header, , signature] = cookie.slice("rrms_session=".length).split(".");
const forgedPayload = Buffer.from(JSON.stringify({ sub: "00000000-0000-4000-a000-000000000002" })).toString("base64url");
const tampered = await visit("/dashboard", `rrms_session=${header}.${forgedPayload}.${signature}`);
check("tampered cookie is treated as signed out", tampered.toLogin && !/Welcome,/.test(tampered.body));

const logoutAction = dash.body.match(/<input type="hidden" name="(\$ACTION_ID_[^"]+)"\/>/)?.[1];
check("dashboard renders a sign-out form", Boolean(logoutAction));
const logoutForm = new FormData();
logoutForm.append(logoutAction ?? "", "");
const out = await fetch(`${BASE}/dashboard`, { method: "POST", body: logoutForm, headers: { cookie }, redirect: "manual" });
check(
  "sign out clears the cookie and redirects to /login",
  out.status === 303 && out.headers.get("location") === "/login" && /rrms_session=;.*Expires=Thu, 01 Jan 1970/i.test(out.headers.get("set-cookie") ?? ""),
  `HTTP ${out.status}`,
);

console.log(failures === 0 ? "\nAll auth smoke checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures ? 1 : 0;
