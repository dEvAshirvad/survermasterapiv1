import type { Server } from 'node:http';

import connectDB, { disconnectDB } from '@/configs/db/mongodb';
import { connectRedis, disconnectRedis } from '@/configs/db/redis';
import env from '@/configs/env';
import logger from '@/configs/logger/winston';
import { startTempUploadSweeper } from '@/configs/multer';
import { ensureStorageBucketExists, isS3Configured } from '@/configs/s3';
import createApp from '@/configs/serverConfig';

const app = createApp();
let server: Server | null = null;
let isShuttingDown = false;
let uploadSweeperTimer: NodeJS.Timeout | null = null;

async function start() {
  try {
    await connectDB();
    logger.info('MongoDB dependency is ready');

    await connectRedis();
    logger.info('Redis dependency is ready');

    if (isS3Configured()) {
      await ensureStorageBucketExists();
      logger.info('Object storage bucket is ready');
    }
    else {
      logger.warn('Object storage is not configured; attachments remain disabled');
    }

    uploadSweeperTimer = startTempUploadSweeper();
    logger.info('Temporary upload sweeper started');

    server = app.listen(env.PORT, () => {
      logger.info(`DMFT Survey API started on http://localhost:${env.PORT}`);
    });
  }
  catch (error) {
    logger.log('fatal', 'Failed to boot application dependencies', error);
    process.exit(1);
  }
}

async function shutdown(signal: string, code = 0) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.warn(`Shutdown initiated by ${signal}`);

  try {
    if (uploadSweeperTimer) {
      clearInterval(uploadSweeperTimer);
      uploadSweeperTimer = null;
      logger.info('Temporary upload sweeper stopped');
    }

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      logger.info('HTTP server closed');
    }

    await disconnectRedis();
    logger.info('Redis connection closed');

    await disconnectDB();
    logger.info('MongoDB connections closed');

    process.exit(code);
  }
  catch (error) {
    logger.log('fatal', 'Error during graceful shutdown', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT', 0);
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM', 0);
});

process.on('unhandledRejection', (reason) => {
  logger.log('fatal', 'Unhandled rejection', reason);
  void shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.log('fatal', 'Uncaught exception', error);
  void shutdown('uncaughtException', 1);
});

void start();
