import './config/env'; // Validate env on startup before anything else
import app from './app';
import { env } from './config/env';
import prisma from './config/database';
import { startHoldExpiryJob } from './jobs/holdExpiry.job';

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  console.log('Database connected.');

  startHoldExpiryJob();

  app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
    console.log(`Swagger UI: http://localhost:${env.PORT}/api/docs`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
