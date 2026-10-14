import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES, resourceFiltersSchema } from "@/schemas/resource";
import { listResources } from "@/server/resource-service";

export const metadata: Metadata = { title: "Resources" };

const controlClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm";

export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const user = await requireUser();
  const rawFilters = await searchParams;
  const filters = resourceFiltersSchema.parse(rawFilters);
  const resources = await listResources(user, rawFilters);
  const isAdmin = user.role === "ADMIN";
  const isFiltered = Boolean(filters.q || filters.type || (isAdmin && filters.status !== "active"));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
        {isAdmin && (
          <Link href="/resources/new" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Add resource
          </Link>
        )}
      </div>

      {/* A plain GET form: filters live in the URL, so results are shareable and work without JavaScript. */}
      <form role="search" className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="q" className="block text-sm font-medium">
            Search name or location
          </label>
          <input id="q" name="q" type="search" defaultValue={filters.q ?? ""} className={controlClass} />
        </div>
        <div>
          <label htmlFor="type" className="block text-sm font-medium">
            Type
          </label>
          <select id="type" name="type" defaultValue={filters.type ?? ""} className={controlClass}>
            <option value="">All types</option>
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RESOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        {isAdmin ? (
          <div>
            <label htmlFor="status" className="block text-sm font-medium">
              Status
            </label>
            <select id="status" name="status" defaultValue={filters.status} className={controlClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
            Apply
          </button>
          {isFiltered && (
            <Link href="/resources" className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-slate-600" aria-live="polite">
        {resources.length} {resources.length === 1 ? "resource" : "resources"}
        {isFiltered ? " match your filters" : ""}
      </p>

      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium">{isFiltered ? "No resources match these filters." : "No resources yet."}</p>
          <p className="mt-1 text-sm text-slate-600">
            {isFiltered ? (
              <Link href="/resources" className="underline">
                Clear the filters
              </Link>
            ) : isAdmin ? (
              <Link href="/resources/new" className="underline">
                Add the first resource
              </Link>
            ) : (
              "An administrator has not added any resources."
            )}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <li key={resource.id}>
              <Link
                href={`/resources/${resource.id}`}
                className="block h-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{resource.name}</h2>
                  {!resource.isActive && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">Inactive</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600">{RESOURCE_TYPE_LABELS[resource.type]}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex gap-1">
                    <dt className="text-slate-500">Location:</dt>
                    <dd>{resource.location}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-slate-500">Capacity:</dt>
                    <dd>{resource.capacity}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
