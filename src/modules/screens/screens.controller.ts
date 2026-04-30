import { Request, Response } from 'express';
import { screensService } from './screens.service';
import { CreateScreenInput } from './screens.schema';

export const screensController = {
  async create(req: Request, res: Response): Promise<void> {
    const screen = await screensService.create(req.body as CreateScreenInput);
    res.status(201).json({ success: true, data: { screen } });
  },

  async list(_req: Request, res: Response): Promise<void> {
    const screens = await screensService.list();
    res.status(200).json({ success: true, data: { screens } });
  },

  async findById(req: Request, res: Response): Promise<void> {
    const screen = await screensService.findById(req.params.id);
    res.status(200).json({ success: true, data: { screen } });
  },
};
