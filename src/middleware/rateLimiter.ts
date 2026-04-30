import rateLimit from 'express-rate-limit';
import { Request } from 'express';

const rateLimitResponse = (retryAfter: number) => ({
  success: false,
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
    details: [{ retryAfter }],
  },
});

/** Auth routes: 10 requests per 15 minutes per IP */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  handler: (_req, res) => {
    const retryAfter = Math.ceil(15 * 60);
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json(rateLimitResponse(retryAfter));
  },
});

/** Booking routes: 20 requests per minute per authenticated user */
export const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    const retryAfter = 60;
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json(rateLimitResponse(retryAfter));
  },
});

/** All other routes: 100 requests per minute per authenticated user */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    const retryAfter = 60;
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json(rateLimitResponse(retryAfter));
  },
});
