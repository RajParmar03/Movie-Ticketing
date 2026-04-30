import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../utils/AppError';
import { calculatePrice } from '../../utils/pricing';
import { CreateShowtimeInput, ListShowtimesQuery } from './showtimes.schema';

export const showtimesService = {
  async create(input: CreateShowtimeInput) {
    const { movieId, screenId, startsAt, endsAt, basePrice } = input;
    const startDt = new Date(startsAt);
    const endDt = new Date(endsAt);

    if (endDt <= startDt) {
      throw new AppError(400, 'VALIDATION_ERROR', 'endsAt must be after startsAt.');
    }

    // Verify movie and screen exist
    const [movie, screen] = await Promise.all([
      prisma.movie.findFirst({ where: { id: movieId, deletedAt: null } }),
      prisma.screen.findUnique({ where: { id: screenId }, include: { seats: true } }),
    ]);

    if (!movie) throw new AppError(404, 'NOT_FOUND', 'Movie not found.');
    if (!screen) throw new AppError(404, 'NOT_FOUND', 'Screen not found.');

    // Check for overlapping showtime on the same screen
    const overlap = await prisma.showtime.findFirst({
      where: {
        screenId,
        OR: [
          { startsAt: { lt: endDt }, endsAt: { gt: startDt } },
        ],
      },
    });

    if (overlap) {
      throw new AppError(
        409,
        'SCREEN_OVERLAP',
        'Another showtime is already scheduled on this screen during the requested time.',
      );
    }

    return prisma.$transaction(async (tx) => {
      const showtime = await tx.showtime.create({
        data: { movieId, screenId, startsAt: startDt, endsAt: endDt, basePrice },
      });

      // Auto-create seat inventory for every seat in the screen
      const seatInventory = screen.seats.map((seat) => ({
        showtimeId: showtime.id,
        seatId: seat.id,
        price: new Prisma.Decimal(calculatePrice(basePrice, seat.type)),
      }));

      await tx.seatInventory.createMany({ data: seatInventory });

      return showtime;
    });
  },

  async list(query: ListShowtimesQuery) {
    const { movieId, screenId, date, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ShowtimeWhereInput = {
      ...(movieId && { movieId }),
      ...(screenId && { screenId }),
      ...(date && {
        startsAt: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lt: new Date(`${date}T23:59:59.999Z`),
        },
      }),
    };

    const [showtimes, total] = await Promise.all([
      prisma.showtime.findMany({
        where,
        skip,
        take: limit,
        include: {
          movie: { select: { id: true, title: true, rating: true, durationMinutes: true } },
          screen: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
      prisma.showtime.count({ where }),
    ]);

    return { showtimes, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  async findById(id: string) {
    const showtime = await prisma.showtime.findUnique({
      where: { id },
      include: {
        movie: { select: { id: true, title: true, genre: true, rating: true, durationMinutes: true } },
        screen: { select: { id: true, name: true, totalSeats: true } },
      },
    });
    if (!showtime) throw new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
    return showtime;
  },

  async getSeatMap(showtimeId: string) {
    const showtime = await prisma.showtime.findUnique({ where: { id: showtimeId } });
    if (!showtime) throw new AppError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');

    const inventory = await prisma.seatInventory.findMany({
      where: { showtimeId },
      include: {
        seat: { select: { row: true, number: true, label: true, type: true } },
      },
      orderBy: [{ seat: { row: 'asc' } }, { seat: { number: 'asc' } }],
    });

    return {
      showtimeId,
      seats: inventory.map((si) => ({
        seatInventoryId: si.id,
        seatId: si.seatId,
        row: si.seat.row,
        number: si.seat.number,
        label: si.seat.label,
        type: si.seat.type,
        price: Number(si.price),
        status: si.status,
        heldUntil: si.heldUntil ?? null,
      })),
    };
  },
};
