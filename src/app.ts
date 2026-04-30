import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs/swagger';
import { errorHandler } from './middleware/errorHandler';

import authRouter from './modules/auth/auth.router';
import moviesRouter from './modules/movies/movies.router';
import screensRouter from './modules/screens/screens.router';
import showtimesRouter from './modules/showtimes/showtimes.router';
import bookingsRouter from './modules/bookings/bookings.router';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/screens', screensRouter);
app.use('/api/showtimes', showtimesRouter);
app.use('/api/bookings', bookingsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.', details: [] },
  });
});

// Centralized error handler — must be last
app.use(errorHandler);

export default app;
