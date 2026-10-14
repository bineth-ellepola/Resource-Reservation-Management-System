// HTTP smoke test for authentication against a running app.
// It bypasses the UI's client-side code, so it checks what the server itself enforces.
//
// Usage: npm run db:seed && npm run dev   (in another terminal)
//        npm run smoke:auth [-- http://localhost:3000]
import { actionFields, check, finish, get, login, submit, submitLogin, textPattern } from "./smoke-lib.mjs";

const ADMIN = { email: "admin@rrms.local", password: "Demo@12345", name: "Demo Admin" };

// With partial prerendering the static shell streams first, so a redirect thrown
// inside the Suspense boundary arrives in the payload instead of as an HTTP 3xx.
const redirectsToLogin = (res) => res.location?.endsWith("/login") || /NEXT_REDIRECT;[^;]*;\/login/.test(res.body);

const anon = await get("/dashboard");
check("anonymous /dashboard is sent to /login", redirectsToLogin(anon), `HTTP ${anon.status}`);
check("anonymous /dashboard renders no user data", !/Welcome,/.test(anon.body));

const wrong = await submitLogin(ADMIN.email, "not-the-password");
check("wrong password shows the generic error", wrong.body.includes("Invalid email or password."));
check("wrong password sets no session cookie", !wrong.setCookie.includes("rrms_session="));

const unknown = await submitLogin("nobody@rrms.local", ADMIN.password);
check("unknown email shows the same generic error", unknown.body.includes("Invalid email or password."));

const invalid = await submitLogin("not-an-email", "");
check(
  "server-side validation reports both fields",
  invalid.body.includes("Enter a valid email address.") && invalid.body.includes("Enter your password."),
);

const ok = await submitLogin(ADMIN.email.toUpperCase(), ADMIN.password);
check("correct login redirects to /dashboard", ok.status === 303 && ok.location === "/dashboard", `HTTP ${ok.status}`);
check("session cookie is HttpOnly", /HttpOnly/i.test(ok.setCookie));
check("session cookie is SameSite=Lax", /SameSite=lax/i.test(ok.setCookie));
check("session cookie expires after 8 hours", /Max-Age=28800/i.test(ok.setCookie));

const cookie = await login(ADMIN.email, ADMIN.password);
const dash = await get("/dashboard", cookie);
check("signed-in /dashboard shows the user and role", textPattern("Welcome, ", ADMIN.name).test(dash.body) && dash.body.includes("ADMIN"));

const [header, , signature] = cookie.slice("rrms_session=".length).split(".");
const forgedPayload = Buffer.from(JSON.stringify({ sub: "00000000-0000-4000-a000-000000000002" })).toString("base64url");
const tampered = await get("/dashboard", `rrms_session=${header}.${forgedPayload}.${signature}`);
check("tampered cookie is treated as signed out", redirectsToLogin(tampered) && !/Welcome,/.test(tampered.body));

const logoutFields = actionFields(dash.body, "Sign out</button>");
check("dashboard renders a sign-out form", [...logoutFields.keys()].some((k) => k.startsWith("$ACTION_ID_")));
const out = await submit("/dashboard", logoutFields, {}, cookie);
check(
  "sign out clears the cookie and redirects to /login",
  out.status === 303 && out.location === "/login" && /rrms_session=;.*Expires=Thu, 01 Jan 1970/i.test(out.setCookie),
  `HTTP ${out.status}`,
);

finish("auth");
