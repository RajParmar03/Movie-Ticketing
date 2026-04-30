import { Router } from 'express';
import { bookingsController } from './bookings.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { bookingLimiter, generalLimiter } from '../../middleware/rateLimiter';
import {
  reserveSchema,
  confirmSchema,
  listBookingsQuerySchema,
  myBookingsQuerySchema,
} from './bookings.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /bookings/reserve:
 *   post:
 *     tags: [Bookings]
 *     summary: Step 1 — Reserve (hold) seats for 10 minutes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [showtimeId, seatIds]
 *             properties:
 *               showtimeId: { type: string, format: uuid }
 *               seatIds:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *                 minItems: 1
 *                 maxItems: 10
 *     responses:
 *       201: { description: Seats held successfully, returns booking ID and expiry }
 *       409: { description: SEAT_UNAVAILABLE or HOLD_CONFLICT }
 */
router.post(
  '/reserve',
  bookingLimiter,
  authorize('customer'),
  validate(reserveSchema),
  asyncHandler(bookingsController.reserve),
);

/**
 * @openapi
 * /bookings/my:
 *   get:
 *     tags: [Bookings]
 *     summary: Get current user's bookings (paginated)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of user's bookings }
 */
router.get(
  '/my',
  generalLimiter,
  authorize('customer'),
  validate(myBookingsQuerySchema, 'query'),
  asyncHandler(bookingsController.myBookings),
);

/**
 * @openapi
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List all bookings (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: showtimeId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, cancelled, expired] }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Paginated list of all bookings }
 */
router.get(
  '/',
  generalLimiter,
  authorize('admin'),
  validate(listBookingsQuerySchema, 'query'),
  asyncHandler(bookingsController.adminList),
);

/**
 * @openapi
 * /bookings/{id}/confirm:
 *   post:
 *     tags: [Bookings]
 *     summary: Step 2 — Confirm booking with mock payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentMethod]
 *             properties:
 *               paymentMethod: { type: string, enum: [card, upi, netbanking, wallet] }
 *               cardLastFour: { type: string, minLength: 4, maxLength: 4 }
 *     responses:
 *       200: { description: Booking confirmed, returns booking reference }
 *       409: { description: BOOKING_EXPIRED or BOOKING_ALREADY_CONFIRMED }
 */
router.post(
  '/:id/confirm',
  bookingLimiter,
  authorize('customer'),
  validate(confirmSchema),
  asyncHandler(bookingsController.confirm),
);

/**
 * @openapi
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking details (customer sees own only; admin sees any)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Booking details }
 *       403: { description: Access denied }
 *       404: { description: Not found }
 */
router.get('/:id', generalLimiter, asyncHandler(bookingsController.findById));

/**
 * @openapi
 * /bookings/{id}:
 *   delete:
 *     tags: [Bookings]
 *     summary: Cancel a booking (customer cancels own; admin cancels any)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Booking cancelled, seats released }
 *       409: { description: Already cancelled or expired }
 */
router.delete('/:id', bookingLimiter, asyncHandler(bookingsController.cancel));

export default router;
