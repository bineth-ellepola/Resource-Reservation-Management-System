import { z } from "zod";
import type { ResourceType } from "@/generated/prisma/enums";

export const RESOURCE_TYPES = ["MEETING_ROOM", "EQUIPMENT", "VEHICLE", "LAB"] as const satisfies readonly ResourceType[];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  MEETING_ROOM: "Meeting room",
  EQUIPMENT: "Equipment",
  VEHICLE: "Vehicle",
  LAB: "Lab",
};

export const MAX_CAPACITY = 1000;

/** Create/update input. Mirrors the database CHECK constraints so users get friendly messages first. */
export const resourceInputSchema = z.object({
  name: z
    .string({ error: "Name is required." })
    .trim()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer."),
  type: z.enum(RESOURCE_TYPES, { error: "Choose a resource type." }),
  location: z
    .string({ error: "Location is required." })
    .trim()
    .min(1, "Location is required.")
    .max(150, "Location must be 150 characters or fewer."),
  capacity: z.coerce
    .number({ error: "Capacity must be a whole number." })
    .int("Capacity must be a whole number.")
    .min(1, "Capacity must be at least 1.")
    .max(MAX_CAPACITY, `Capacity must be ${MAX_CAPACITY} or fewer.`),
});

export type ResourceInput = z.infer<typeof resourceInputSchema>;

export const RESOURCE_STATUS_FILTERS = ["active", "inactive", "all"] as const;

/** List filters from the URL. Bad or repeated values fall back to defaults instead of erroring. */
export const resourceFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(RESOURCE_TYPES).optional().catch(undefined),
  status: z.enum(RESOURCE_STATUS_FILTERS).default("active").catch("active"),
});

export type ResourceFilters = z.infer<typeof resourceFiltersSchema>;
