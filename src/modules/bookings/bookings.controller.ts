import { Request, Response } from 'express';
import { bookingsService } from './bookings.service';
import { ReserveInput, ConfirmInput, ListBookingsQuery, MyBookingsQuery } from './bookings.schema';

export const bookingsController = {
  async reserve(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const data = await bookingsService.reserve(userId, req.body as ReserveInput);
    res.status(201).json({ success: true, data });
  },

  async confirm(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const data = await bookingsService.confirm(req.params.id, userId, req.body as ConfirmInput);
    res.status(200).json({ success: true, data });
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const data = await bookingsService.cancel(req.params.id, userId, isAdmin);
    res.status(200).json({ success: true, data });
  },

  async findById(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const data = await bookingsService.findById(req.params.id, userId, isAdmin);
    res.status(200).json({ success: true, data });
  },

  async myBookings(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const data = await bookingsService.myBookings(userId, req.query as unknown as MyBookingsQuery);
    res.status(200).json({ success: true, data });
  },

  async adminList(req: Request, res: Response): Promise<void> {
    const data = await bookingsService.adminList(req.query as unknown as ListBookingsQuery);
    res.status(200).json({ success: true, data });
  },
};
