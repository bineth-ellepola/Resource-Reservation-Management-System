// Idempotent demo seed: safe to run repeatedly (npm run db:seed).
// Users are upserted by email; resources and reservations use fixed IDs.
// Seeded reservations are only created if missing, so re-running never moves a
// booking onto a slot taken during a demo (which would violate the exclusion constraint).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { addDays, colomboDateString, colomboDateTime } from "../src/lib/dates";
import type { ReservationStatus, ResourceType, Role } from "../src/generated/prisma/client";

// Local demo credentials only. Documented in README; never use for real accounts.
const DEMO_PASSWORD = "Demo@12345";

const users: { email: string; name: string; role: Role }[] = [
  { email: "admin@rrms.local", name: "Demo Admin", role: "ADMIN" },
  { email: "user@rrms.local", name: "Demo User", role: "USER" },
  { email: "user2@rrms.local", name: "Second User", role: "USER" },
];

const resources: {
  id: string;
  name: string;
  type: ResourceType;
  location: string;
  capacity: number;
  isActive: boolean;
}[] = [
  { id: "00000000-0000-4000-a000-000000000001", name: "Board Room A", type: "MEETING_ROOM", location: "Level 3, East Wing", capacity: 12, isActive: true },
  { id: "00000000-0000-4000-a000-000000000002", name: "Huddle Room 2", type: "MEETING_ROOM", location: "Level 2, West Wing", capacity: 4, isActive: true },
  { id: "00000000-0000-4000-a000-000000000003", name: "4K Projector Kit", type: "EQUIPMENT", location: "IT Store, Level 1", capacity: 1, isActive: true },
  { id: "00000000-0000-4000-a000-000000000004", name: "Toyota HiAce Van", type: "VEHICLE", location: "Basement Car Park B1", capacity: 14, isActive: true },
  { id: "00000000-0000-4000-a000-000000000005", name: "Electronics Lab", type: "LAB", location: "Level 4, Lab Block", capacity: 20, isActive: true },
  { id: "00000000-0000-4000-a000-000000000006", name: "Old Conference Room", type: "MEETING_ROOM", location: "Level 1, Annex", capacity: 8, isActive: false },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const userIds: Record<string, string> = {};
  for (const user of users) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
    userIds[user.email] = saved.id;
  }

  for (const { id, ...data } of resources) {
    await prisma.resource.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // Times are relative to today's date in Asia/Colombo so the demo always has upcoming bookings.
  const today = colomboDateString();
  const day = (offset: number) => addDays(today, offset);
  const [boardRoom, huddleRoom, , van, lab] = resources.map((r) => r.id);

  const reservations: {
    id: string;
    email: string;
    resourceId: string;
    date: string;
    start: string;
    end: string;
    status: ReservationStatus;
    purpose: string;
  }[] = [
    // Back-to-back bookings: 10:00 end and 10:00 start are allowed by the [start, end) range.
    { id: "00000000-0000-4000-b000-000000000001", email: "user@rrms.local", resourceId: boardRoom, date: day(1), start: "09:00", end: "10:00", status: "CONFIRMED", purpose: "Sprint planning" },
    { id: "00000000-0000-4000-b000-000000000002", email: "admin@rrms.local", resourceId: boardRoom, date: day(1), start: "10:00", end: "11:30", status: "CONFIRMED", purpose: "Vendor review" },
    // A cancelled booking overlapping a confirmed one: cancelled rows do not block the slot.
    { id: "00000000-0000-4000-b000-000000000003", email: "user@rrms.local", resourceId: lab, date: day(1), start: "14:00", end: "16:00", status: "CANCELLED", purpose: "Circuit testing (cancelled)" },
    { id: "00000000-0000-4000-b000-000000000004", email: "user2@rrms.local", resourceId: lab, date: day(1), start: "14:30", end: "15:30", status: "CONFIRMED", purpose: "Soldering workshop" },
    { id: "00000000-0000-4000-b000-000000000005", email: "user@rrms.local", resourceId: van, date: day(2), start: "08:00", end: "17:00", status: "CONFIRMED", purpose: "Site visit to Kandy" },
    // Past booking for history.
    { id: "00000000-0000-4000-b000-000000000006", email: "user2@rrms.local", resourceId: huddleRoom, date: day(-1), start: "15:00", end: "16:00", status: "CONFIRMED", purpose: "Client call" },
  ];

  for (const r of reservations) {
    await prisma.reservation.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        userId: userIds[r.email],
        resourceId: r.resourceId,
        startAt: colomboDateTime(r.date, r.start),
        endAt: colomboDateTime(r.date, r.end),
        status: r.status,
        purpose: r.purpose,
      },
    });
  }

  console.log(`Seeded ${users.length} users, ${resources.length} resources, ${reservations.length} reservations.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
