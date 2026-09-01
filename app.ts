import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import auditRoutes from './routes/audits';
import { logger } from '@utils/logger';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
    });
  });

  // API Routes
  app.use('/api/v1/audits', auditRoutes);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
      method: req.method,
    });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, _: any) => {
    logger.error('Unhandled error', { error: err });
    res.status(500).json({
      error: 'Internal server error',
      message: err.message || 'Unknown error',
    });
  });

  return app;
}
