import type { Metadata } from "next";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Signed in as {user.email} ({user.role === "ADMIN" ? "administrator" : "user"}).
      </p>
    </section>
  );
}
