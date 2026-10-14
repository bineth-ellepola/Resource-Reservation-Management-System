import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateResourceAction } from "@/app/actions/resources";
import { AccessDenied } from "@/components/access-denied";
import { ResourceForm } from "@/components/resource-form";
import { requireUser } from "@/lib/session";
import { AuthError } from "@/server/authz";
import { NotFoundError } from "@/server/errors";
import { getResourceForEdit } from "@/server/resource-service";

export const metadata: Metadata = { title: "Edit resource" };

export default async function EditResourcePage({ params }: PageProps<"/resources/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;

  let resource;
  try {
    resource = await getResourceForEdit(user, id);
  } catch (error) {
    if (error instanceof AuthError) return <AccessDenied />;
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {resource.name}</h1>
      <ResourceForm
        action={updateResourceAction.bind(null, resource.id)}
        initial={resource}
        submitLabel="Save changes"
        cancelHref={`/resources/${resource.id}`}
      />
    </section>
  );
}
