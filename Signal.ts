import { query } from '@config/database';
import { Signal, EngineId, SignalType } from '@/types';
import { logger } from '@utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class SignalModel {
  /**
   * Create a new signal
   */
  static async create(data: {
    auditId: string;
    engineId: EngineId;
    signalCode: string;
    signalType: SignalType;
    name: string;
    description: string;
    normalizedScore: number;
    confidence: number;
    evidence?: Record<string, any>;
    computationDetails?: Record<string, any>;
    aiAssessment?: string;
    aiReasoning?: Record<string, any>;
  }): Promise<Signal> {
    const id = uuidv4();
    const sql = `
      INSERT INTO signals 
      (id, audit_id, engine_id, signal_code, signal_type, name, description,
       normalized_score, confidence, evidence, computation_details,
       ai_assessment, ai_reasoning, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `;

    const values = [
      id,
      data.auditId,
      data.engineId,
      data.signalCode,
      data.signalType,
      data.name,
      data.description,
      data.normalizedScore,
      data.confidence,
      data.evidence ? JSON.stringify(data.evidence) : null,
      data.computationDetails ? JSON.stringify(data.computationDetails) : null,
      data.aiAssessment || null,
      data.aiReasoning ? JSON.stringify(data.aiReasoning) : null,
    ];

    try {
      const result = await query(sql, values);
      logger.debug(`Signal created: ${data.signalCode} for audit ${data.auditId}`);
      return this.rowToSignal(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create signal', { error, signalCode: data.signalCode });
      throw error;
    }
  }

  /**
   * Get signal by ID
   */
  static async findById(id: string): Promise<Signal | null> {
    const sql = 'SELECT * FROM signals WHERE id = $1';
    try {
      const result = await query(sql, [id]);
      if (result.rows.length === 0) return null;
      return this.rowToSignal(result.rows[0]);
    } catch (error) {
      logger.error('Failed to find signal', { error, id });
      throw error;
    }
  }

  /**
   * Get signals by audit
   */
  static async findByAudit(auditId: string): Promise<Signal[]> {
    const sql = `
      SELECT * FROM signals 
      WHERE audit_id = $1 
      ORDER BY engine_id, signal_code
    `;
    try {
      const result = await query(sql, [auditId]);
      return result.rows.map(row => this.rowToSignal(row));
    } catch (error) {
      logger.error('Failed to find signals by audit', { error, auditId });
      throw error;
    }
  }

  /**
   * Get signals by engine
   */
  static async findByEngine(auditId: string, engineId: EngineId): Promise<Signal[]> {
    const sql = `
      SELECT * FROM signals 
      WHERE audit_id = $1 AND engine_id = $2
      ORDER BY signal_code
    `;
    try {
      const result = await query(sql, [auditId, engineId]);
      return result.rows.map(row => this.rowToSignal(row));
    } catch (error) {
      logger.error('Failed to find signals by engine', { error, auditId, engineId });
      throw error;
    }
  }

  /**
   * Get signals by type
   */
  static async findByType(auditId: string, signalType: SignalType): Promise<Signal[]> {
    const sql = `
      SELECT * FROM signals 
      WHERE audit_id = $1 AND signal_type = $2
      ORDER BY engine_id, signal_code
    `;
    try {
      const result = await query(sql, [auditId, signalType]);
      return result.rows.map(row => this.rowToSignal(row));
    } catch (error) {
      logger.error('Failed to find signals by type', { error, auditId, signalType });
      throw error;
    }
  }

  /**
   * Get specific signal code
   */
  static async findByCode(auditId: string, signalCode: string): Promise<Signal | null> {
    const sql = 'SELECT * FROM signals WHERE audit_id = $1 AND signal_code = $2';
    try {
      const result = await query(sql, [auditId, signalCode]);
      if (result.rows.length === 0) return null;
      return this.rowToSignal(result.rows[0]);
    } catch (error) {
      logger.error('Failed to find signal by code', { error, auditId, signalCode });
      throw error;
    }
  }

  /**
   * Get signal statistics for an audit
   */
  static async getStats(auditId: string): Promise<{
    total: number;
    byType: Record<SignalType, number>;
    avgScore: number;
    avgConfidence: number;
    byEngine: Record<EngineId, { count: number; avgScore: number }>;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        AVG(normalized_score) as avg_score,
        AVG(confidence) as avg_confidence,
        signal_type,
        engine_id
      FROM signals
      WHERE audit_id = $1
      GROUP BY signal_type, engine_id
    `;

    try {
      const result = await query(sql, [auditId]);

      const stats = {
        total: 0,
        byType: {} as Record<SignalType, number>,
        avgScore: 0,
        avgConfidence: 0,
        byEngine: {} as Record<EngineId, { count: number; avgScore: number }>,
      };

      let totalScore = 0;
      let totalConfidence = 0;
      let count = 0;

      for (const row of result.rows) {
        count++;
        totalScore += parseFloat(row.avg_score);
        totalConfidence += parseFloat(row.avg_confidence);

        stats.byType[row.signal_type] = (stats.byType[row.signal_type] || 0) + 1;

        if (!stats.byEngine[row.engine_id]) {
          stats.byEngine[row.engine_id] = { count: 0, avgScore: 0 };
        }
        stats.byEngine[row.engine_id].count++;
        stats.byEngine[row.engine_id].avgScore = parseFloat(row.avg_score);
      }

      stats.total = count;
      stats.avgScore = count > 0 ? totalScore / count : 0;
      stats.avgConfidence = count > 0 ? totalConfidence / count : 0;

      return stats;
    } catch (error) {
      logger.error('Failed to get signal stats', { error, auditId });
      throw error;
    }
  }

  /**
   * Delete signals for an audit
   */
  static async deleteByAudit(auditId: string): Promise<boolean> {
    const sql = 'DELETE FROM signals WHERE audit_id = $1';
    try {
      const result = await query(sql, [auditId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete signals by audit', { error, auditId });
      throw error;
    }
  }

  /**
   * Convert database row to Signal object
   */
  private static rowToSignal(row: any): Signal {
    return {
      id: row.id,
      auditId: row.audit_id,
      engineId: row.engine_id,
      signalCode: row.signal_code,
      signalType: row.signal_type,
      name: row.name,
      description: row.description,
      rawValue: row.raw_value,
      normalizedScore: row.normalized_score,
      confidence: row.confidence,
      evidence: row.evidence,
      computationDetails: row.computation_details,
      aiAssessment: row.ai_assessment,
      aiReasoning: row.ai_reasoning,
      aiSystemResponses: row.ai_system_responses,
      crossSourceAlignment: row.cross_source_alignment,
      computedAt: row.computed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
