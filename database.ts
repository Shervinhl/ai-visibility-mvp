import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from '@utils/logger';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'aivisibility',
  password: process.env.DB_PASSWORD || 'devpassword',
  database: process.env.DB_NAME || 'ai_visibility',
  max: 20,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

/**
 * Execute a raw SQL query
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms`, { query: text.substring(0, 100) });
    return result;
  } catch (error) {
    logger.error('Database query error', { error, query: text });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Initialize database schema
 */
export async function initializeDatabase(): Promise<void> {
  try {
    logger.info('Initializing database schema...');
    
    const migrationPath = path.join(__dirname, '../../migrations/001_init.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    await query(sql);
    
    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    throw error;
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    logger.info('Database connection successful', { timestamp: result.rows[0].now });
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
}

/**
 * Close all database connections
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export default pool;
