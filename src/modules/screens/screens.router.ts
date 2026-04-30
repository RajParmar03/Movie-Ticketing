import { Router } from 'express';
import { screensController } from './screens.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { generalLimiter } from '../../middleware/rateLimiter';
import { createScreenSchema } from './screens.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(generalLimiter, authenticate, authorize('admin'));

/**
 * @openapi
 * /screens:
 *   post:
 *     tags: [Screens]
 *     summary: Create a screen and auto-generate all seats (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateScreen'
 *     responses:
 *       201: { description: Screen created with seats }
 */
router.post('/', validate(createScreenSchema), asyncHandler(screensController.create));

/**
 * @openapi
 * /screens:
 *   get:
 *     tags: [Screens]
 *     summary: List all screens (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of screens }
 */
router.get('/', asyncHandler(screensController.list));

/**
 * @openapi
 * /screens/{id}:
 *   get:
 *     tags: [Screens]
 *     summary: Get screen details with full seat map (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Screen with seat map }
 *       404: { description: Not found }
 */
router.get('/:id', asyncHandler(screensController.findById));

export default router;
