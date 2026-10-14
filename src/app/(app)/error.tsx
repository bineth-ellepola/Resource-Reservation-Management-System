"use client";

// Unexpected server errors (e.g. the database is down). Expected problems such as
// validation, permission and not-found are handled where they happen.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h1 className="text-lg font-semibold text-red-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-red-800">
        The page could not be loaded. Check that the database is running, then try again.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-red-700">Reference: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
      >
        Try again
      </button>
    </section>
  );
}
