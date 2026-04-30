import { Request, Response, NextFunction } from 'express';
import { authorize } from '../../src/middleware/authorize';
import { AppError } from '../../src/utils/AppError';

function makeReq(role?: string): Partial<Request> {
  return { user: role ? { id: 'user-1', role } : undefined } as Partial<Request>;
}

const mockRes = {} as Response;

describe('authorize middleware', () => {
  it('calls next() when user has a matching role', () => {
    const next = jest.fn() as NextFunction;
    authorize('admin')(makeReq('admin') as Request, mockRes, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(AppError 403) when user role does not match', () => {
    const next = jest.fn() as NextFunction;
    authorize('admin')(makeReq('customer') as Request, mockRes, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('calls next(AppError 401) when req.user is undefined', () => {
    const next = jest.fn() as NextFunction;
    authorize('admin')(makeReq() as Request, mockRes, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('allows multiple roles', () => {
    const next = jest.fn() as NextFunction;
    authorize('admin', 'customer')(makeReq('customer') as Request, mockRes, next);
    expect(next).toHaveBeenCalledWith();
  });
});
