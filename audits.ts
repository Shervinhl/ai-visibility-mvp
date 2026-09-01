import { Router, Request, Response } from 'express';
import { AuditModel } from '@models/Audit';
import { OrganizationModel } from '@models/Organization';
import { SignalModel } from '@models/Signal';
import { AuditOrchestrator } from '@core/audit-orchestrator';
import { AuditStatus, EngineId, SignalType } from '@/types';
import { logger } from '@utils/logger';
import * as Joi from 'joi';

const router = Router();

/**
 * POST /api/v1/audits
 * Create and start a new audit
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, organizationName, domain, websiteUrl, auditType } = req.body;

    // Validate input
    const schema = Joi.object({
      organizationId: Joi.string().optional(),
      organizationName: Joi.string().required(),
      domain: Joi.string().optional(),
      websiteUrl: Joi.string().uri().optional(),
      auditType: Joi.string().valid('full', 'partial', 'quick').default('full'),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details.map((d) => d.message).join(', '),
      });
    }

    let organization;

    // Find or create organization
    if (organizationId) {
      organization = await OrganizationModel.findById(organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
    } else {
      // Check if organization already exists
      if (domain) {
        organization = await OrganizationModel.findByDomain(domain);
      }

      if (!organization) {
        // Create new organization
        organization = await OrganizationModel.create({
          name: organizationName,
          domain: domain,
          websiteUrl: websiteUrl,
        });
      }
    }

    // Create audit
    const audit = await AuditModel.create({
      organizationId: organization.id,
      auditType: value.auditType || 'full',
      engineToRun: [EngineId.E1, EngineId.E2, EngineId.E3, EngineId.E4, EngineId.E5],
      signalTypes: [SignalType.A, SignalType.B, SignalType.C, SignalType.D],
    });

    logger.info(`Audit created: ${audit.id}`, { organizationId: organization.id });

    // Queue audit job (for now, run synchronously in MVP)
    // In production, this would be queued to a job processor
    setImmediate(async () => {
      try {
        await AuditOrchestrator.runAudit(audit.id);
      } catch (error) {
        logger.error(`Audit job failed: ${audit.id}`, { error });
      }
    });

    res.status(201).json({
      id: audit.id,
      organizationId: organization.id,
      organizationName: organization.name,
      status: audit.status,
      createdAt: audit.createdAt,
    });
  } catch (error) {
    logger.error('Failed to create audit', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/audits/:id
 * Get audit details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const audit = await AuditModel.findById(id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    const results = await AuditOrchestrator.getAuditResults(id);

    res.json(results);
  } catch (error) {
    logger.error('Failed to get audit', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/audits
 * List audits
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, status, limit = 20, offset = 0 } = req.query;

    let audits;

    if (organizationId) {
      audits = await AuditModel.findByOrganization(
        organizationId as string,
        parseInt(limit as string),
        parseInt(offset as string)
      );
    } else if (status) {
      audits = await AuditModel.findByStatus(status as AuditStatus);
    } else {
      // For MVP, just return empty list
      audits = [];
    }

    res.json({
      count: audits.length,
      audits: audits.map((a) => ({
        id: a.id,
        organizationId: a.organizationId,
        status: a.status,
        auditType: a.auditType,
        createdAt: a.createdAt,
        completedAt: a.completedAt,
        durationSeconds: a.durationSeconds,
      })),
    });
  } catch (error) {
    logger.error('Failed to list audits', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/audits/:id/signals
 * Get all signals for an audit
 */
router.get('/:id/signals', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { engine, type } = req.query;

    let signals;

    if (engine) {
      signals = await SignalModel.findByEngine(id, engine as EngineId);
    } else if (type) {
      signals = await SignalModel.findByType(id, type as SignalType);
    } else {
      signals = await SignalModel.findByAudit(id);
    }

    res.json({
      count: signals.length,
      signals: signals.map((s) => ({
        code: s.signalCode,
        name: s.name,
        engine: s.engineId,
        type: s.signalType,
        score: s.normalizedScore,
        confidence: s.confidence,
        evidence: s.evidence,
      })),
    });
  } catch (error) {
    logger.error('Failed to get signals', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/audits/:id/signals/:code
 * Get specific signal
 */
router.get('/:id/signals/:code', async (req: Request, res: Response) => {
  try {
    const { id, code } = req.params;

    const signal = await SignalModel.findByCode(id, code);
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    res.json({
      code: signal.signalCode,
      name: signal.name,
      engine: signal.engineId,
      type: signal.signalType,
      score: signal.normalizedScore,
      confidence: signal.confidence,
      evidence: signal.evidence,
      computationDetails: signal.computationDetails,
    });
  } catch (error) {
    logger.error('Failed to get signal', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/v1/audits/:id
 * Delete an audit
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await AuditModel.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    res.json({ message: 'Audit deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete audit', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
