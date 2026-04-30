import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'TOKEN_INVALID', 'Authentication required.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'),
      );
    }
    next();
  };
}
