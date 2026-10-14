-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('MEETING_ROOM', 'EQUIPMENT', 'VEHICLE', 'LAB');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "purpose" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Reservation_userId_startAt_idx" ON "Reservation"("userId", "startAt");

-- CreateIndex
CREATE INDEX "Reservation_resourceId_startAt_idx" ON "Reservation"("resourceId", "startAt");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (not expressible in schema.prisma).
-- Do not remove these when regenerating migrations.
-- ---------------------------------------------------------------------------

-- Lets a GiST index combine scalar equality ("resourceId" WITH =) with range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A reservation must end after it starts.
ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_valid_time
  CHECK ("endAt" > "startAt");

-- Core double-booking guard. Two CONFIRMED reservations for the same resource may
-- not have overlapping [startAt, endAt) ranges. '[)' makes the end exclusive, so
-- back-to-back bookings (10:00-11:00 and 11:00-12:00) are allowed. The WHERE clause
-- means CANCELLED rows are kept for history but no longer block the slot.
-- PostgreSQL enforces this atomically, so concurrent inserts cannot both succeed;
-- the loser fails with SQLSTATE 23P01 (exclusion_violation).
ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_no_confirmed_overlap
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');

-- Resource data integrity (also validated server-side with Zod).
ALTER TABLE "Resource"
  ADD CONSTRAINT resource_capacity_positive CHECK ("capacity" > 0),
  ADD CONSTRAINT resource_name_not_blank CHECK (btrim("name") <> ''),
  ADD CONSTRAINT resource_location_not_blank CHECK (btrim("location") <> '');
