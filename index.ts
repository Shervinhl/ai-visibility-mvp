import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { createApp } from '@api/app';
import {
  initializeDatabase,
  testConnection as testDatabaseConnection,
  closeDatabase,
} from '@config/database';
import {
  initializeRedis,
  testConnection as testRedisConnection,
  closeRedis,
} from '@config/redis';
import { logger } from '@utils/logger';

const PORT = process.env.API_PORT || 4000;
const HOST = process.env.API_HOST || '0.0.0.0';

async function start() {
  try {
    logger.info('=== AI Visibility Backend Starting ===');

    // Test and initialize database
    logger.info('Initializing database...');
    await initializeDatabase();
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Test and initialize Redis
    logger.info('Initializing Redis...');
    await initializeRedis();
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      throw new Error('Failed to connect to Redis');
    }

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Server listening on http://${HOST}:${PORT}`);
      logger.info('=== AI Visibility Backend Ready ===');
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        await closeDatabase();
        await closeRedis();
        logger.info('Server shut down successfully');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
start().catch((error) => {
  logger.error('Startup error', { error });
  process.exit(1);
});
