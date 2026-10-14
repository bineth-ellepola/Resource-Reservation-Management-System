import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/server/auth-service";
import { AuthError } from "@/server/authz";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  createResource,
  getResourceDetails,
  getResourceForEdit,
  listResources,
  setResourceActive,
  updateResource,
} from "@/server/resource-service";
import { createUser, insertResource, resetDatabase, toSessionUser } from "../helpers/db";

let admin: SessionUser;
let alice: SessionUser;
let bob: SessionUser;

const validInput = { name: "Board Room", type: "MEETING_ROOM", location: "Level 3", capacity: "12" };

beforeEach(async () => {
  await resetDatabase();
  admin = toSessionUser(await createUser({ email: "admin@example.com", role: "ADMIN", name: "Admin" }));
  alice = toSessionUser(await createUser({ email: "alice@example.com", name: "Alice" }));
  bob = toSessionUser(await createUser({ email: "bob@example.com", name: "Bob" }));
});

afterAll(() => prisma.$disconnect());

async function expectAuthError(promise: Promise<unknown>, status: 401 | 403) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).status).toBe(status);
}

async function expectFieldError(promise: Promise<unknown>, field: string, message: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ValidationError);
  expect((error as ValidationError).fieldErrors[field]).toContain(message);
}

describe("createResource", () => {
  it("lets an admin create a resource, trimming text and converting capacity", async () => {
    const created = await createResource(admin, { ...validInput, name: "  Board Room  " });
    expect(created).toMatchObject({ name: "Board Room", capacity: 12, isActive: true, type: "MEETING_ROOM" });
  });

  it("rejects regular users with 403 and anonymous callers with 401, without writing", async () => {
    await expectAuthError(createResource(alice, validInput), 403);
    await expectAuthError(createResource(null, validInput), 401);
    expect(await prisma.resource.count()).toBe(0);
  });

  it.each([
    ["0", "Capacity must be at least 1."],
    ["-3", "Capacity must be at least 1."],
    ["2.5", "Capacity must be a whole number."],
    ["abc", "Capacity must be a whole number."],
    ["1001", "Capacity must be 1000 or fewer."],
  ])("rejects capacity %s", async (capacity, message) => {
    await expectFieldError(createResource(admin, { ...validInput, capacity }), "capacity", message);
  });

  it.each(["", "   "])("rejects a blank name (%j)", async (name) => {
    await expectFieldError(createResource(admin, { ...validInput, name }), "name", "Name is required.");
  });

  it("rejects a blank location and an unknown type", async () => {
    await expectFieldError(createResource(admin, { ...validInput, location: " " }), "location", "Location is required.");
    await expectFieldError(createResource(admin, { ...validInput, type: "SPACESHIP" }), "type", "Choose a resource type.");
  });

  it("ignores fields that are not part of the form (e.g. isActive or id)", async () => {
    const created = await createResource(admin, {
      ...validInput,
      isActive: false,
      id: "00000000-0000-4000-8000-000000000000",
    });
    expect(created.isActive).toBe(true);
    expect(created.id).not.toBe("00000000-0000-4000-8000-000000000000");
  });
});

describe("updateResource", () => {
  it("lets an admin update a resource", async () => {
    const resource = await insertResource();
    const updated = await updateResource(admin, resource.id, { ...validInput, capacity: 20 });
    expect(updated).toMatchObject({ name: "Board Room", capacity: 20 });
  });

  it("forbids regular users and leaves the resource unchanged", async () => {
    const resource = await insertResource({ name: "Original" });
    await expectAuthError(updateResource(alice, resource.id, validInput), 403);
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })).name).toBe("Original");
  });

  it("validates input before updating", async () => {
    const resource = await insertResource();
    await expectFieldError(updateResource(admin, resource.id, { ...validInput, capacity: 0 }), "capacity", "Capacity must be at least 1.");
  });

  it("reports unknown and malformed IDs as not found", async () => {
    await expect(updateResource(admin, "11111111-1111-4111-8111-111111111111", validInput)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateResource(admin, "not-a-uuid", validInput)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deactivation", () => {
  it("lets an admin deactivate and reactivate; regular users cannot", async () => {
    const resource = await insertResource();
    await expectAuthError(setResourceActive(alice, resource.id, false), 403);

    expect((await setResourceActive(admin, resource.id, false)).isActive).toBe(false);
    expect((await setResourceActive(admin, resource.id, true)).isActive).toBe(true);
  });

  it("hides inactive resources from regular users in lists and details", async () => {
    const active = await insertResource({ name: "Active Room" });
    const inactive = await insertResource({ name: "Closed Room", isActive: false });

    const userList = await listResources(alice, { status: "all" });
    expect(userList.map((r) => r.id)).toEqual([active.id]);
    await expect(getResourceDetails(alice, inactive.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets admins filter by status and see inactive details", async () => {
    const active = await insertResource({ name: "Active Room" });
    const inactive = await insertResource({ name: "Closed Room", isActive: false });

    expect((await listResources(admin, { status: "active" })).map((r) => r.id)).toEqual([active.id]);
    expect((await listResources(admin, { status: "inactive" })).map((r) => r.id)).toEqual([inactive.id]);
    expect(await listResources(admin, { status: "all" })).toHaveLength(2);
    expect((await getResourceDetails(admin, inactive.id)).resource.id).toBe(inactive.id);
    expect((await getResourceForEdit(admin, inactive.id)).id).toBe(inactive.id);
  });

  it("keeps existing reservations when a resource is deactivated", async () => {
    const resource = await insertResource();
    await prisma.reservation.create({
      data: { userId: alice.id, resourceId: resource.id, startAt: new Date("2030-01-01T10:00Z"), endAt: new Date("2030-01-01T11:00Z") },
    });
    await setResourceActive(admin, resource.id, false);
    expect(await prisma.reservation.count({ where: { resourceId: resource.id } })).toBe(1);
  });
});

describe("listResources filters", () => {
  beforeEach(async () => {
    await insertResource({ name: "Board Room A", type: "MEETING_ROOM", location: "Level 3, East Wing" });
    await insertResource({ name: "Projector", type: "EQUIPMENT", location: "IT Store" });
    await insertResource({ name: "Van", type: "VEHICLE", location: "Car Park" });
  });

  const names = async (filters: unknown) => (await listResources(alice, filters)).map((r) => r.name);

  it("searches name and location case-insensitively", async () => {
    expect(await names({ q: "board" })).toEqual(["Board Room A"]);
    expect(await names({ q: "EAST wing" })).toEqual(["Board Room A"]);
  });

  it("filters by type", async () => {
    expect(await names({ type: "VEHICLE" })).toEqual(["Van"]);
  });

  it("falls back to defaults for invalid filter values instead of failing", async () => {
    expect(await names({ type: "SPACESHIP", status: ["all", "x"], q: "" })).toHaveLength(3);
  });

  it("requires a signed-in user", async () => {
    await expectAuthError(listResources(null, {}), 401);
  });
});

describe("getResourceDetails", () => {
  it("lists upcoming confirmed reservations only, revealing booker details to the booker and admins", async () => {
    const resource = await insertResource();
    const now = new Date("2030-01-01T09:00Z");
    const book = (userId: string, start: string, end: string, status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") =>
      prisma.reservation.create({
        data: { userId, resourceId: resource.id, startAt: new Date(start), endAt: new Date(end), status, purpose: "Secret plans" },
      });
    await book(alice.id, "2030-01-01T07:00Z", "2030-01-01T08:00Z"); // past
    await book(alice.id, "2030-01-01T10:00Z", "2030-01-01T11:00Z");
    await book(bob.id, "2030-01-01T11:00Z", "2030-01-01T12:00Z");
    await book(bob.id, "2030-01-01T13:00Z", "2030-01-01T14:00Z", "CANCELLED");

    const forAlice = (await getResourceDetails(alice, resource.id, now)).upcoming;
    expect(forAlice.map((r) => [r.isMine, r.bookedBy, r.purpose])).toEqual([
      [true, "Alice", "Secret plans"],
      [false, null, null],
    ]);

    const forAdmin = (await getResourceDetails(admin, resource.id, now)).upcoming;
    expect(forAdmin.map((r) => r.bookedBy)).toEqual(["Alice", "Bob"]);
  });

  it("includes a booking that is in progress", async () => {
    const resource = await insertResource();
    await prisma.reservation.create({
      data: { userId: alice.id, resourceId: resource.id, startAt: new Date("2030-01-01T08:00Z"), endAt: new Date("2030-01-01T10:00Z") },
    });
    const { upcoming } = await getResourceDetails(alice, resource.id, new Date("2030-01-01T09:00Z"));
    expect(upcoming).toHaveLength(1);
  });
});
