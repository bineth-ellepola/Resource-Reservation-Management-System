import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { MainNav, NavLinks } from "@/components/main-nav";
import { getCurrentUser } from "@/lib/session";

// The header renders as static shell; only the user menu reads the session, behind
// its own Suspense boundary. Each page still enforces access itself via requireUser().
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10"
      >
        Skip to main content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <MainNav />
          </Suspense>
          <Suspense fallback={<span className="text-sm text-slate-400">Loading…</span>}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none">
        {children}
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>
        {user.name}{" "}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{user.role}</span>
      </span>
      <form action={logout}>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
          Sign out
        </button>
      </form>
    </div>
  );
}
