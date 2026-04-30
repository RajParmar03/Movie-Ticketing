import { Request, Response } from 'express';
import { showtimesService } from './showtimes.service';
import { CreateShowtimeInput, ListShowtimesQuery } from './showtimes.schema';

export const showtimesController = {
  async create(req: Request, res: Response): Promise<void> {
    const showtime = await showtimesService.create(req.body as CreateShowtimeInput);
    res.status(201).json({ success: true, data: { showtime } });
  },

  async list(req: Request, res: Response): Promise<void> {
    const data = await showtimesService.list(req.query as unknown as ListShowtimesQuery);
    res.status(200).json({ success: true, data });
  },

  async findById(req: Request, res: Response): Promise<void> {
    const showtime = await showtimesService.findById(req.params.id);
    res.status(200).json({ success: true, data: { showtime } });
  },

  async getSeatMap(req: Request, res: Response): Promise<void> {
    const data = await showtimesService.getSeatMap(req.params.id);
    res.status(200).json({ success: true, data });
  },
};
