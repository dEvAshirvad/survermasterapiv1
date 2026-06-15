import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

import env from '@/configs/env';
import logger from '@/configs/logger/winston';

export const DB_URL = env.MONGODB_URI!;

export const client = new MongoClient(DB_URL);
export const db = client.db();
let nativeConnected = false;
let isConnecting = false;

/**
 * Production-grade MongoDB connection with connection pooling
 */
export default async function connectDB(): Promise<void> {
  if (isMongoReady() || isConnecting) {
    return;
  }

  isConnecting = true;
  mongoose.set('strictQuery', false);

  const connectionOptions: mongoose.ConnectOptions = {
    maxPoolSize: 10,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    retryReads: true,
    bufferCommands: false,
  };

  try {
    if (!nativeConnected) {
      await client.connect();
      nativeConnected = true;
      logger.info('MongoDB native client connected');
    }

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(DB_URL, connectionOptions);
      const connection = mongoose.connection;

      logger.info('MongoDB mongoose connected', {
        host: connection.host,
        port: connection.port,
        name: connection.name,
      });

      connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
      });

      connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });
    }
  }
  catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
  finally {
    isConnecting = false;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  if (nativeConnected) {
    await client.close();
    nativeConnected = false;
  }
}

export function getMongoStatus() {
  return {
    mongooseReadyState: mongoose.connection.readyState,
    mongooseConnected: mongoose.connection.readyState === 1,
    nativeConnected,
    isConnecting,
  };
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1 && nativeConnected;
}
