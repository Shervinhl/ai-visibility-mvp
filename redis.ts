import { createClient, RedisClientType } from 'redis';
import { logger } from '@utils/logger';

let redisClient: RedisClientType;

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<RedisClientType> {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis: Max reconnection attempts exceeded');
            return new Error('Redis reconnection failed');
          }
          return retries * 100;
        },
      },
    });

    redisClient.on('error', (err) => logger.error('Redis Client Error', err));
    redisClient.on('connect', () => logger.info('Redis Client Connected'));
    redisClient.on('ready', () => logger.info('Redis Client Ready'));

    await redisClient.connect();
    logger.info('Redis connection established');

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis', { error });
    throw error;
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

/**
 * Set a key-value pair with optional expiration
 */
export async function setCache(key: string, value: any, expirationSeconds?: number): Promise<void> {
  const client = getRedisClient();
  try {
    const serialized = JSON.stringify(value);
    if (expirationSeconds) {
      await client.setEx(key, expirationSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  } catch (error) {
    logger.error('Redis set error', { key, error });
  }
}

/**
 * Get a cached value
 */
export async function getCache(key: string): Promise<any> {
  const client = getRedisClient();
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis get error', { key, error });
    return null;
  }
}

/**
 * Delete a key
 */
export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient();
  try {
    await client.del(key);
  } catch (error) {
    logger.error('Redis delete error', { key, error });
  }
}

/**
 * Clear all cache
 */
export async function clearCache(): Promise<void> {
  const client = getRedisClient();
  try {
    await client.flushDb();
    logger.info('Cache cleared');
  } catch (error) {
    logger.error('Redis flush error', { error });
  }
}

/**
 * Test Redis connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.ping();
    logger.info('Redis connection successful');
    return true;
  } catch (error) {
    logger.error('Redis connection failed', { error });
    return false;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}
