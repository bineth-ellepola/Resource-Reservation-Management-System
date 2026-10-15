"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/resources", label: "Resources" },
  { href: "/reservations", label: "Bookings" },
] as const;

/**
 * Main navigation; marks the current section with aria-current for screen readers and styling.
 * usePathname suspends while prerendering dynamic routes (e.g. /resources/[id]) under
 * cacheComponents, so the layout wraps this in Suspense with <NavLinks pathname={null} />.
 */
export function MainNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Link href="/dashboard" className="font-semibold text-indigo-700">
        RRMS
      </Link>
      {LINKS.map(({ href, label }) => {
        const current = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`text-sm ${current ? "font-medium text-indigo-700 underline underline-offset-4" : "text-slate-700 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
