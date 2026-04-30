import { Request, Response } from 'express';
import { authService } from './auth.service';
import { RegisterInput, LoginInput, RefreshInput } from './auth.schema';

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const data = await authService.register(req.body as RegisterInput);
    res.status(201).json({ success: true, data });
  },

  async login(req: Request, res: Response): Promise<void> {
    const data = await authService.login(req.body as LoginInput);
    res.status(200).json({ success: true, data });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as RefreshInput;
    const data = await authService.refresh(refreshToken);
    res.status(200).json({ success: true, data });
  },

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as RefreshInput;
    await authService.logout(refreshToken);
    res.status(200).json({ success: true, data: { message: 'Logged out successfully.' } });
  },
};
