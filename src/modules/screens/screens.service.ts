import prisma from '../../config/database';
import { AppError } from '../../utils/AppError';
import { ROW_LABELS } from '../../config/constants';
import { CreateScreenInput } from './screens.schema';

export const screensService = {
  async create(input: CreateScreenInput) {
    const { name, rows, seatsPerRow, rowTypeMapping } = input;

    // Build row→type lookup
    const rowType: Record<string, 'standard' | 'premium' | 'vip'> = {};
    for (const [type, rowList] of Object.entries(rowTypeMapping) as [
      'standard' | 'premium' | 'vip',
      string[],
    ][]) {
      for (const row of rowList) {
        rowType[row.toUpperCase()] = type;
      }
    }

    // Validate all rows are covered
    const usedRows = ROW_LABELS.slice(0, rows);
    for (const row of usedRows) {
      if (!rowType[row]) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Row ${row} is not mapped to any seat type in rowTypeMapping.`,
        );
      }
    }

    const totalSeats = rows * seatsPerRow;

    return prisma.$transaction(async (tx) => {
      const screen = await tx.screen.create({
        data: { name, totalSeats, rows, seatsPerRow },
      });

      const seats = usedRows.flatMap((row) =>
        Array.from({ length: seatsPerRow }, (_, i) => ({
          screenId: screen.id,
          row,
          number: i + 1,
          label: `${row}${i + 1}`,
          type: rowType[row],
        })),
      );

      await tx.seat.createMany({ data: seats });

      return screen;
    });
  },

  async list() {
    return prisma.screen.findMany({
      select: { id: true, name: true, totalSeats: true, rows: true, seatsPerRow: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  },

  async findById(id: string) {
    const screen = await prisma.screen.findUnique({
      where: { id },
      include: {
        seats: {
          orderBy: [{ row: 'asc' }, { number: 'asc' }],
        },
      },
    });
    if (!screen) {
      throw new AppError(404, 'NOT_FOUND', 'Screen not found.');
    }
    return screen;
  },
};
