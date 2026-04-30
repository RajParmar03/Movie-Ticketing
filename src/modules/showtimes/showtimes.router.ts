import { Router } from 'express';
import { showtimesController } from './showtimes.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { generalLimiter } from '../../middleware/rateLimiter';
import { createShowtimeSchema, listShowtimesQuerySchema } from './showtimes.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(generalLimiter);

/**
 * @openapi
 * /showtimes:
 *   post:
 *     tags: [Showtimes]
 *     summary: Create a showtime (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateShowtime'
 *     responses:
 *       201: { description: Showtime created with seat inventory }
 *       409: { description: Screen schedule conflict }
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createShowtimeSchema),
  asyncHandler(showtimesController.create),
);

/**
 * @openapi
 * /showtimes:
 *   get:
 *     tags: [Showtimes]
 *     summary: List showtimes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: movieId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: screenId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: List of showtimes }
 */
router.get(
  '/',
  authenticate,
  validate(listShowtimesQuerySchema, 'query'),
  asyncHandler(showtimesController.list),
);

/**
 * @openapi
 * /showtimes/{id}:
 *   get:
 *     tags: [Showtimes]
 *     summary: Get showtime details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Showtime details }
 *       404: { description: Not found }
 */
router.get('/:id', authenticate, asyncHandler(showtimesController.findById));

/**
 * @openapi
 * /showtimes/{id}/seats:
 *   get:
 *     tags: [Showtimes]
 *     summary: Get seat map with availability for a showtime
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Seat map with status per seat }
 *       404: { description: Showtime not found }
 */
router.get('/:id/seats', authenticate, asyncHandler(showtimesController.getSeatMap));

export default router;
