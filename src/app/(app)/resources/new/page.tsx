import type { Metadata } from "next";
import { createResourceAction } from "@/app/actions/resources";
import { AccessDenied } from "@/components/access-denied";
import { ResourceForm } from "@/components/resource-form";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add resource" };

export default async function NewResourcePage() {
  const user = await requireUser();
  // UI-level check for a clear message; the service enforces ADMIN on submit regardless.
  if (user.role !== "ADMIN") {
    return <AccessDenied />;
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add resource</h1>
      <ResourceForm action={createResourceAction} submitLabel="Create resource" cancelHref="/resources" />
    </section>
  );
}
