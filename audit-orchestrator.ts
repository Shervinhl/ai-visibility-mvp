import { Audit, AuditStatus, AuditData, EngineId, SignalType } from '@/types';
import { AuditModel } from '@models/Audit';
import { OrganizationModel } from '@models/Organization';
import { SignalModel } from '@models/Signal';
import { WebCrawler } from '@integrations/web/crawler';
import { E1_TYPE_A_SIGNALS } from '@core/signals/typeA/e1-signals';
import { logger } from '@utils/logger';

/**
 * Orchestrates the entire audit workflow
 */
export class AuditOrchestrator {
  /**
   * Run a complete audit
   */
  static async runAudit(auditId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Get audit and organization
      const audit = await AuditModel.findById(auditId);
      if (!audit) {
        throw new Error(`Audit not found: ${auditId}`);
      }

      const organization = await OrganizationModel.findById(audit.organizationId);
      if (!organization) {
        throw new Error(`Organization not found: ${audit.organizationId}`);
      }

      logger.info(`Starting audit: ${auditId} for ${organization.name}`);

      // Update audit status to RUNNING
      await AuditModel.updateStarted(auditId);

      // Step 1: Crawl website
      logger.info(`Crawling website: ${organization.websiteUrl}`);
      const crawledPages = await this.crawlWebsite(organization.websiteUrl || '');

      // Step 2: Query AI systems (if E5 in engines to run)
      let aiQueries = [];
      if (audit.engineToRun.includes(EngineId.E5)) {
        logger.info(`Querying AI systems for ${organization.name}`);
        // aiQueries = await this.queryAISystems(organization);
      }

      // Step 3: Build audit data
      const auditData: AuditData = {
        audit,
        organization,
        crawledPages,
        aiQueries,
        previousAudit: undefined,
      };

      // Step 4: Run signal computations
      logger.info(`Computing signals...`);
      await this.runSignalComputation(auditData);

      // Step 5: Calculate scores
      logger.info(`Calculating scores...`);
      await this.calculateScores(auditId);

      // Step 6: Mark audit as complete
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      await AuditModel.updateCompletion(auditId, {
        status: AuditStatus.COMPLETED,
        completedAt: new Date(),
        durationSeconds,
        crawledPages,
        aiQueries,
      });

      logger.info(`Audit completed successfully in ${durationSeconds}s: ${auditId}`);
    } catch (error) {
      logger.error(`Audit failed: ${auditId}`, { error });

      // Mark audit as failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';

      try {
        await AuditModel.updateCompletion(auditId, {
          status: AuditStatus.FAILED,
          completedAt: new Date(),
          durationSeconds: Math.round((Date.now() - startTime) / 1000),
          errorMessage,
          errorStack,
        });
      } catch (updateError) {
        logger.error(`Failed to update audit status: ${auditId}`, { updateError });
      }

      throw error;
    }
  }

  /**
   * Crawl website and return page data
   */
  private static async crawlWebsite(websiteUrl: string): Promise<any[]> {
    const crawler = new WebCrawler();
    try {
      await crawler.initialize();

      // Get homepage URL with protocol
      let startUrl = websiteUrl;
      if (!startUrl.startsWith('http')) {
        startUrl = `https://${startUrl}`;
      }

      const pages = await crawler.crawlWebsite(startUrl);
      logger.info(`Crawled ${pages.length} pages`);

      return pages;
    } catch (error) {
      logger.error('Crawl failed', { error });
      throw error;
    } finally {
      await crawler.close();
    }
  }

  /**
   * Query AI systems about the organization
   */
  private static async queryAISystems(_: any): Promise<any[]> {
    // TODO: Implement AI system queries for E5 signals
    return [];
  }

  /**
   * Run signal computations for all enabled signals
   */
  private static async runSignalComputation(auditData: AuditData): Promise<void> {
    const { audit } = auditData;

    // For MVP, only run E1 signals (Retrieval)
    if (audit.engineToRun.includes(EngineId.E1)) {
      logger.info(`Computing E1 (Retrieval) signals`);
      for (const signal of E1_TYPE_A_SIGNALS) {
        try {
          await signal.save(auditData);
          logger.debug(`Signal computed: ${signal.code}`);
        } catch (error) {
          logger.warn(`Failed to compute signal ${signal.code}`, { error });
        }
      }
    }

    // TODO: Add E2-E7 signal computations as they're implemented
  }

  /**
   * Calculate engine and overall scores
   */
  private static async calculateScores(auditId: string): Promise<void> {
    try {
      // Get all signals for this audit
      const signals = await SignalModel.findByAudit(auditId);

      if (signals.length === 0) {
        logger.warn(`No signals found for audit: ${auditId}`);
        return;
      }

      // Group signals by engine
      const signalsByEngine: Record<EngineId, any[]> = {} as any;

      for (const signal of signals) {
        if (!signalsByEngine[signal.engineId]) {
          signalsByEngine[signal.engineId] = [];
        }
        signalsByEngine[signal.engineId].push(signal);
      }

      // Calculate engine scores
      const engineScores: Record<EngineId, number> = {} as any;
      const allScores: number[] = [];

      for (const [engineId, engineSignals] of Object.entries(signalsByEngine)) {
        const scores = engineSignals.map((s) => s.normalizedScore);
        const engineScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        engineScores[engineId as EngineId] = engineScore;
        allScores.push(...scores);

        logger.info(`Engine ${engineId} score: ${engineScore.toFixed(2)}`);
      }

      // Calculate overall score (simple average for MVP)
      const overallScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;

      logger.info(`Overall AI Visibility Score: ${overallScore.toFixed(2)}`);

      // TODO: Save engine scores and overall score to database
      // This would involve creating engine_scores and ai_visibility_scores records
    } catch (error) {
      logger.error('Failed to calculate scores', { error });
      throw error;
    }
  }

  /**
   * Get audit results with all scores and signals
   */
  static async getAuditResults(auditId: string): Promise<any> {
    const audit = await AuditModel.findById(auditId);
    if (!audit) {
      throw new Error(`Audit not found: ${auditId}`);
    }

    const signals = await SignalModel.findByAudit(auditId);
    const signalStats = await SignalModel.getStats(auditId);

    // Group signals by engine
    const signalsByEngine: Record<string, any> = {};
    for (const signal of signals) {
      if (!signalsByEngine[signal.engineId]) {
        signalsByEngine[signal.engineId] = [];
      }
      signalsByEngine[signal.engineId].push({
        code: signal.signalCode,
        name: signal.name,
        type: signal.signalType,
        score: signal.normalizedScore,
        confidence: signal.confidence,
      });
    }

    return {
      audit: {
        id: audit.id,
        organizationId: audit.organizationId,
        status: audit.status,
        auditType: audit.auditType,
        startedAt: audit.startedAt,
        completedAt: audit.completedAt,
        durationSeconds: audit.durationSeconds,
      },
      statistics: {
        totalSignals: signalStats.total,
        avgScore: signalStats.avgScore.toFixed(2),
        avgConfidence: signalStats.avgConfidence.toFixed(2),
        byType: signalStats.byType,
        byEngine: signalStats.byEngine,
      },
      signalsByEngine,
      signals: signals.map((s) => ({
        code: s.signalCode,
        name: s.name,
        engine: s.engineId,
        type: s.signalType,
        score: s.normalizedScore,
        confidence: s.confidence,
        evidence: s.evidence,
      })),
    };
  }
}
