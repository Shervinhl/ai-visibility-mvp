import { query } from '@config/database';
import { Audit, AuditStatus, EngineId, SignalType } from '@/types';
import { logger } from '@utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class AuditModel {
  /**
   * Create a new audit
   */
  static async create(data: {
    organizationId: string;
    auditType: 'full' | 'partial' | 'quick';
    engineToRun?: EngineId[];
    signalTypes?: SignalType[];
  }): Promise<Audit> {
    const id = uuidv4();
    const engineToRun = data.engineToRun || ['E1', 'E2', 'E3', 'E4', 'E5'];
    const signalTypes = data.signalTypes || ['A', 'B', 'C', 'D'];

    const sql = `
      INSERT INTO audits 
      (id, organization_id, audit_type, status, engines_to_run, signal_types)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      id,
      data.organizationId,
      data.auditType,
      AuditStatus.QUEUED,
      JSON.stringify(engineToRun),
      JSON.stringify(signalTypes),
    ];

    try {
      const result = await query(sql, values);
      logger.info(`Audit created: ${id}`, { organizationId: data.organizationId });
      return this.rowToAudit(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create audit', { error, data });
      throw error;
    }
  }

  /**
   * Get audit by ID
   */
  static async findById(id: string): Promise<Audit | null> {
    const sql = 'SELECT * FROM audits WHERE id = $1';
    try {
      const result = await query(sql, [id]);
      if (result.rows.length === 0) return null;
      return this.rowToAudit(result.rows[0]);
    } catch (error) {
      logger.error('Failed to find audit', { error, id });
      throw error;
    }
  }

  /**
   * Get audits by organization
   */
  static async findByOrganization(
    organizationId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Audit[]> {
    const sql = `
      SELECT * FROM audits 
      WHERE organization_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    try {
      const result = await query(sql, [organizationId, limit, offset]);
      return result.rows.map(row => this.rowToAudit(row));
    } catch (error) {
      logger.error('Failed to find audits by organization', { error, organizationId });
      throw error;
    }
  }

  /**
   * Get all audits by status
   */
  static async findByStatus(status: AuditStatus): Promise<Audit[]> {
    const sql = 'SELECT * FROM audits WHERE status = $1 ORDER BY created_at DESC';
    try {
      const result = await query(sql, [status]);
      return result.rows.map(row => this.rowToAudit(row));
    } catch (error) {
      logger.error('Failed to find audits by status', { error, status });
      throw error;
    }
  }

  /**
   * Update audit status
   */
  static async updateStatus(id: string, status: AuditStatus): Promise<Audit> {
    const sql = 'UPDATE audits SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
    try {
      const result = await query(sql, [status, id]);
      if (result.rows.length === 0) {
        throw new Error('Audit not found');
      }
      logger.info(`Audit status updated: ${id} -> ${status}`);
      return this.rowToAudit(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update audit status', { error, id });
      throw error;
    }
  }

  /**
   * Update audit with completion data
   */
  static async updateCompletion(
    id: string,
    data: {
      status: AuditStatus;
      completedAt: Date;
      durationSeconds: number;
      crawledPages?: any;
      aiQueries?: any;
      errorMessage?: string;
      errorStack?: string;
    }
  ): Promise<Audit> {
    const sql = `
      UPDATE audits 
      SET status = $1, completed_at = $2, duration_seconds = $3, 
          crawled_pages = $4, ai_queries = $5, 
          error_message = $6, error_stack = $7, updated_at = NOW()
      WHERE id = $8 
      RETURNING *
    `;

    const values = [
      data.status,
      data.completedAt,
      data.durationSeconds,
      data.crawledPages ? JSON.stringify(data.crawledPages) : null,
      data.aiQueries ? JSON.stringify(data.aiQueries) : null,
      data.errorMessage || null,
      data.errorStack || null,
      id,
    ];

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        throw new Error('Audit not found');
      }
      logger.info(`Audit completed: ${id}`);
      return this.rowToAudit(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update audit completion', { error, id });
      throw error;
    }
  }

  /**
   * Update audit start time
   */
  static async updateStarted(id: string): Promise<Audit> {
    const sql = `
      UPDATE audits 
      SET status = $1, started_at = NOW(), updated_at = NOW()
      WHERE id = $2 
      RETURNING *
    `;
    try {
      const result = await query(sql, [AuditStatus.RUNNING, id]);
      if (result.rows.length === 0) {
        throw new Error('Audit not found');
      }
      return this.rowToAudit(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update audit started', { error, id });
      throw error;
    }
  }

  /**
   * Delete audit and all related data
   */
  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM audits WHERE id = $1';
    try {
      const result = await query(sql, [id]);
      const deleted = result.rowCount > 0;
      if (deleted) {
        logger.info(`Audit deleted: ${id}`);
      }
      return deleted;
    } catch (error) {
      logger.error('Failed to delete audit', { error, id });
      throw error;
    }
  }

  /**
   * Convert database row to Audit object
   */
  private static rowToAudit(row: any): Audit {
    return {
      id: row.id,
      organizationId: row.organization_id,
      auditType: row.audit_type,
      status: row.status,
      engineToRun: row.engines_to_run || [],
      signalTypes: row.signal_types || [],
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationSeconds: row.duration_seconds,
      crawledPages: row.crawled_pages,
      structuredData: row.structured_data,
      aiQueries: row.ai_queries,
      errorMessage: row.error_message,
      errorStack: row.error_stack,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
