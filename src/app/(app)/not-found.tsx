import Link from "next/link";

export default function NotFound() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-slate-600">This page or resource does not exist, or you do not have access to it.</p>
      <Link href="/resources" className="mt-3 inline-block text-sm font-medium text-indigo-700 underline">
        Back to resources
      </Link>
    </section>
  );
}
