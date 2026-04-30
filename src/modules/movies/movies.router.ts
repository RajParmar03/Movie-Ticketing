import { Router } from 'express';
import { moviesController } from './movies.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { generalLimiter } from '../../middleware/rateLimiter';
import { createMovieSchema, updateMovieSchema, listMoviesQuerySchema } from './movies.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(generalLimiter);

/**
 * @openapi
 * /movies:
 *   post:
 *     tags: [Movies]
 *     summary: Create a movie (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMovie'
 *     responses:
 *       201: { description: Movie created }
 *       403: { description: Forbidden }
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createMovieSchema),
  asyncHandler(moviesController.create),
);

/**
 * @openapi
 * /movies:
 *   get:
 *     tags: [Movies]
 *     summary: List movies with filtering, search, and pagination
 *     parameters:
 *       - in: query
 *         name: genre
 *         schema: { type: string }
 *       - in: query
 *         name: language
 *         schema: { type: string }
 *       - in: query
 *         name: rating
 *         schema: { type: string, enum: [U, UA, A] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [releaseDate, title] }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Movie list with pagination }
 */
router.get('/', validate(listMoviesQuerySchema, 'query'), asyncHandler(moviesController.list));

/**
 * @openapi
 * /movies/{id}:
 *   get:
 *     tags: [Movies]
 *     summary: Get movie details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Movie details }
 *       404: { description: Not found }
 */
router.get('/:id', asyncHandler(moviesController.findById));

/**
 * @openapi
 * /movies/{id}:
 *   patch:
 *     tags: [Movies]
 *     summary: Update a movie (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Movie updated }
 */
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(updateMovieSchema),
  asyncHandler(moviesController.update),
);

/**
 * @openapi
 * /movies/{id}:
 *   delete:
 *     tags: [Movies]
 *     summary: Soft-delete a movie (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Movie soft-deleted }
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(moviesController.softDelete),
);

export default router;
