import Link from "next/link";

export function AccessDenied({ message = "Only administrators can access this page." }: { message?: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h1 className="text-lg font-semibold text-amber-900">Access denied</h1>
      <p className="mt-1 text-sm text-amber-800">{message}</p>
      <Link href="/resources" className="mt-3 inline-block text-sm font-medium text-amber-900 underline">
        Back to resources
      </Link>
    </section>
  );
}
