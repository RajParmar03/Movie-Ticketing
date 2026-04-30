import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../utils/AppError';
import { generateReference } from '../../utils/generateReference';
import { HOLD_DURATION_MS } from '../../config/constants';
import { ReserveInput, ConfirmInput, ListBookingsQuery, MyBookingsQuery } from './bookings.schema';

// Raw query result types (snake_case = actual DB column names via @map)
type LockedSeatRow = {
  id: string;
  seat_id: string;
  price: string;
  label: string;
  type: string;
};

const bookingSelect = {
  id: true,
  status: true,
  totalAmount: true,
  bookingReference: true,
  expiresAt: true,
  createdAt: true,
  showtime: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      movie: { select: { id: true, title: true } },
      screen: { select: { id: true, name: true } },
    },
  },
  bookedSeats: {
    select: {
      price: true,
      seatInventory: {
        select: {
          seat: { select: { label: true, row: true, number: true, type: true } },
        },
      },
    },
  },
  payment: {
    select: { id: true, transactionId: true, amount: true, status: true, paymentMethod: true },
  },
};

export const bookingsService = {
  async reserve(userId: string, input: ReserveInput) {
    const { showtimeId, seatIds } = input;

    return prisma.$transaction(
      async (tx) => {
        // Verify showtime exists and hasn't started
        const showtime = await tx.showtime.findUnique({ where: { id: showtimeId } });
        if (!showtime) throw new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
        if (showtime.startsAt <= new Date()) {
          throw new AppError(409, 'SHOWTIME_STARTED', 'This showtime has already started.');
        }

        // ─── THE CRITICAL SECTION ──────────────────────────────────────────────
        // SELECT ... FOR UPDATE SKIP LOCKED
        //
        // Acquires exclusive row-level locks on the requested seat_inventory rows.
        // SKIP LOCKED means: if any row is already locked by another concurrent
        // transaction, skip it and return only the rows we could lock immediately.
        //
        // This guarantees that if 10 requests race for the same seat, exactly 1
        // acquires the lock; the other 9 get 0 rows back and receive 409.
        // ──────────────────────────────────────────────────────────────────────
        const seatIdList = Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`));

        const lockedSeats = await tx.$queryRaw<LockedSeatRow[]>(Prisma.sql`
          SELECT
            si.id,
            si.seat_id,
            si.price::text,
            s.label,
            s.type
          FROM seat_inventory si
          JOIN seats s ON s.id = si.seat_id
          WHERE si.showtime_id = ${showtimeId}::uuid
            AND si.seat_id IN (${seatIdList})
            AND si.status = 'available'
          FOR UPDATE SKIP LOCKED
        `);

        // Determine the correct error: conflict vs genuinely unavailable
        if (lockedSeats.length < seatIds.length) {
          const unavailableCount = await tx.seatInventory.count({
            where: { showtimeId, seatId: { in: seatIds }, status: { not: 'available' } },
          });

          if (unavailableCount > 0) {
            throw new AppError(
              409,
              'SEAT_UNAVAILABLE',
              'One or more selected seats are no longer available.',
            );
          }
          // Rows exist but were skipped due to concurrent lock → conflict
          throw new AppError(
            409,
            'HOLD_CONFLICT',
            'One or more seats are currently being reserved by another user. Please try again.',
          );
        }

        const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
        const totalAmount = lockedSeats.reduce((sum, s) => sum + parseFloat(s.price), 0);

        // Create the Booking record first (needed for FK in booked_seats)
        const booking = await tx.booking.create({
          data: { userId, showtimeId, totalAmount, expiresAt },
        });

        // Create booked_seat junction records
        await tx.bookedSeat.createMany({
          data: lockedSeats.map((s) => ({
            bookingId: booking.id,
            seatInventoryId: s.id,
            price: parseFloat(s.price),
          })),
        });

        // Transition seat_inventory rows: available → held
        const inventoryIdList = Prisma.join(
          lockedSeats.map((s) => Prisma.sql`${s.id}::uuid`),
        );
        await tx.$executeRaw(Prisma.sql`
          UPDATE seat_inventory
          SET status = 'held', held_until = ${expiresAt}
          WHERE id IN (${inventoryIdList})
        `);

        return {
          bookingId: booking.id,
          status: booking.status,
          expiresAt: booking.expiresAt,
          totalAmount: booking.totalAmount,
          seats: lockedSeats.map((s) => ({
            label: s.label,
            type: s.type,
            price: parseFloat(s.price),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10000 },
    );
  },

  async confirm(bookingId: string, userId: string, input: ConfirmInput) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { bookedSeats: true },
      });

      if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (booking.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Access denied.');

      if (booking.status === 'confirmed') {
        throw new AppError(409, 'BOOKING_ALREADY_CONFIRMED', 'Booking is already confirmed.');
      }
      if (booking.status === 'cancelled') {
        throw new AppError(409, 'BOOKING_CANCELLED', 'This booking has been cancelled.');
      }
      if (booking.status === 'expired' || booking.expiresAt < new Date()) {
        throw new AppError(409, 'BOOKING_EXPIRED', 'The seat hold has expired. Please start over.');
      }

      const seatInventoryIds = booking.bookedSeats.map((bs) => bs.seatInventoryId);
      const bookingReference = generateReference();

      await Promise.all([
        tx.seatInventory.updateMany({
          where: { id: { in: seatInventoryIds } },
          data: { status: 'booked', heldUntil: null },
        }),
        tx.booking.update({
          where: { id: bookingId },
          data: { status: 'confirmed', bookingReference },
        }),
      ]);

      const payment = await tx.payment.create({
        data: {
          bookingId,
          amount: booking.totalAmount,
          paymentMethod: input.paymentMethod,
          cardLastFour: input.cardLastFour ?? null,
          transactionId: `TXN-${crypto.randomUUID()}`,
        },
      });

      return {
        bookingId,
        bookingReference,
        status: 'confirmed',
        totalAmount: Number(booking.totalAmount),
        payment: {
          transactionId: payment.transactionId,
          amount: Number(payment.amount),
          status: payment.status,
          method: payment.paymentMethod,
        },
      };
    });
  },

  async cancel(bookingId: string, userId: string, isAdmin: boolean) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { bookedSeats: true, payment: true },
      });

      if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      if (!isAdmin && booking.userId !== userId) {
        throw new AppError(403, 'FORBIDDEN', 'You can only cancel your own bookings.');
      }
      if (booking.status === 'cancelled') {
        throw new AppError(409, 'BOOKING_ALREADY_CANCELLED', 'Booking is already cancelled.');
      }
      if (booking.status === 'expired') {
        throw new AppError(409, 'BOOKING_EXPIRED', 'Cannot cancel an expired booking.');
      }

      const seatInventoryIds = booking.bookedSeats.map((bs) => bs.seatInventoryId);

      await tx.seatInventory.updateMany({
        where: { id: { in: seatInventoryIds } },
        data: { status: 'available', heldUntil: null },
      });

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'cancelled' },
      });

      if (booking.status === 'confirmed' && booking.payment) {
        await tx.payment.update({
          where: { id: booking.payment.id },
          data: { status: 'refunded' },
        });
      }

      return { message: 'Booking cancelled successfully.' };
    });
  },

  async findById(bookingId: string, userId: string, isAdmin: boolean) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: bookingSelect,
    });

    if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');

    const fullBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!isAdmin && fullBooking?.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied.');
    }

    return booking;
  },

  async myBookings(userId: string, query: MyBookingsQuery) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: { userId },
        skip,
        take: limit,
        select: bookingSelect,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.count({ where: { userId } }),
    ]);

    return { bookings, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  async adminList(query: ListBookingsQuery) {
    const { showtimeId, status, fromDate, toDate, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {
      ...(showtimeId && { showtimeId }),
      ...(status && { status }),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate && { gte: new Date(`${fromDate}T00:00:00.000Z`) }),
              ...(toDate && { lte: new Date(`${toDate}T23:59:59.999Z`) }),
            },
          }
        : {}),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        select: { ...bookingSelect, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.count({ where }),
    ]);

    return { bookings, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },
};
