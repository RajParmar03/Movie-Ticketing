import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../utils/AppError';
import { CreateMovieInput, UpdateMovieInput, ListMoviesQuery } from './movies.schema';

export const moviesService = {
  async create(input: CreateMovieInput) {
    return prisma.movie.create({
      data: {
        ...input,
        releaseDate: new Date(input.releaseDate),
      },
    });
  },

  async list(query: ListMoviesQuery) {
    const { genre, language, rating, search, sortBy, sortOrder, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.MovieWhereInput = {
      deletedAt: null,
      ...(genre && { genre: { equals: genre, mode: 'insensitive' } }),
      ...(language && { language: { equals: language, mode: 'insensitive' } }),
      ...(rating && { rating }),
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
    };

    const [movies, total] = await Promise.all([
      prisma.movie.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          genre: true,
          language: true,
          durationMinutes: true,
          rating: true,
          releaseDate: true,
          posterUrl: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.movie.count({ where }),
    ]);

    return {
      movies,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async findById(id: string) {
    const movie = await prisma.movie.findFirst({
      where: { id, deletedAt: null },
    });
    if (!movie) {
      throw new AppError(404, 'NOT_FOUND', 'Movie not found.');
    }
    return movie;
  },

  async update(id: string, input: UpdateMovieInput) {
    await this.findById(id);
    return prisma.movie.update({
      where: { id },
      data: {
        ...input,
        ...(input.releaseDate && { releaseDate: new Date(input.releaseDate) }),
      },
    });
  },

  async softDelete(id: string) {
    await this.findById(id);
    await prisma.movie.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
