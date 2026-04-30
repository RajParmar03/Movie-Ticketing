import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';

type ExpiredRow = { id: string; booking_id: string | null };

async function expireStaleHolds(): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        // Find expired held seats.
        // FOR UPDATE SKIP LOCKED prevents this job from conflicting with active
        // booking transactions that may be in the middle of a reserve or confirm.
        const expired = await tx.$queryRaw<ExpiredRow[]>(Prisma.sql`
          SELECT si.id, bs.booking_id
          FROM seat_inventory si
          JOIN booked_seats bs ON bs.seat_inventory_id = si.id
          JOIN bookings b ON b.id = bs.booking_id
          WHERE si.status = 'held'
            AND b.status = 'pending'
            AND b.expires_at < NOW()
          FOR UPDATE OF si SKIP LOCKED
        `);

        if (expired.length === 0) return;

        const seatInventoryIds = [...new Set(expired.map((r) => r.id))];
        const bookingIds = [...new Set(expired.map((r) => r.booking_id).filter(Boolean))] as string[];

        const idList = Prisma.join(seatInventoryIds.map((id) => Prisma.sql`${id}::uuid`));

        // Revert seat_inventory rows to available
        await tx.$executeRaw(Prisma.sql`
          UPDATE seat_inventory
          SET status = 'available', held_until = NULL
          WHERE id IN (${idList})
        `);

        // Mark associated bookings as expired
        await tx.booking.updateMany({
          where: { id: { in: bookingIds }, status: 'pending' },
          data: { status: 'expired' },
        });

        console.log(
          `[holdExpiry] Expired ${seatInventoryIds.length} seat(s) from ${bookingIds.length} booking(s).`,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (err) {
    console.error('[holdExpiry] Job error:', err);
  }
}

export function startHoldExpiryJob(): cron.ScheduledTask {
  const task = cron.schedule('* * * * *', expireStaleHolds, { scheduled: false });
  task.start();
  console.log('[holdExpiry] Job started — running every minute.');
  return task;
}
