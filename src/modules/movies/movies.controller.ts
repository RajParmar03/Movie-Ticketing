import { Request, Response } from 'express';
import { moviesService } from './movies.service';
import { CreateMovieInput, UpdateMovieInput, ListMoviesQuery } from './movies.schema';

export const moviesController = {
  async create(req: Request, res: Response): Promise<void> {
    const movie = await moviesService.create(req.body as CreateMovieInput);
    res.status(201).json({ success: true, data: { movie } });
  },

  async list(req: Request, res: Response): Promise<void> {
    const data = await moviesService.list(req.query as unknown as ListMoviesQuery);
    res.status(200).json({ success: true, data });
  },

  async findById(req: Request, res: Response): Promise<void> {
    const movie = await moviesService.findById(req.params.id);
    res.status(200).json({ success: true, data: { movie } });
  },

  async update(req: Request, res: Response): Promise<void> {
    const movie = await moviesService.update(req.params.id, req.body as UpdateMovieInput);
    res.status(200).json({ success: true, data: { movie } });
  },

  async softDelete(req: Request, res: Response): Promise<void> {
    await moviesService.softDelete(req.params.id);
    res.status(200).json({ success: true, data: { message: 'Movie deleted successfully.' } });
  },
};
