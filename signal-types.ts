/**
 * Core type definitions for AI Visibility signal system
 * Supports all 4 signal types (A, B, C, D) across 7 engines
 */

import { UUID } from 'crypto';

// ============================================================================
// ENUMS
// ============================================================================

export enum SignalType {
  A = 'A', // Deterministic
  B = 'B', // AI-Assisted
  C = 'C', // Generative Observation
  D = 'D'  // Cross-Source Reasoning
}

export enum EngineId {
  E1 = 'E1', // Retrieval Intelligence
  E2 = 'E2', // Entity Intelligence
  E3 = 'E3', // Semantic Understanding
  E4 = 'E4', // Authority & Evidence
  E5 = 'E5', // Generative Perception
  E6 = 'E6', // Competitive Intelligence
  E7 = 'E7'  // AI Response Intelligence
}

export enum AuditStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused'
}

export enum AISystem {
  CHATGPT = 'chatgpt',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  PERPLEXITY = 'perplexity'
}

// ============================================================================
// ORGANIZATION & AUDIT
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  foundedYear?: number;
  websiteUrl?: string;
  
  // Entity identity
  entityType?: 'company' | 'product' | 'service';
  entityNames?: {
    official: string;
    aliases: string[];
    variations: string[];
  };
  locations?: {
    primary?: string;
    secondary?: string[];
    offices?: string[];
  };
  
  // Relationships
  parentOrganization?: string;
  brandRelationships?: Record<string, string>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface Audit {
  id: string;
  organizationId: string;
  auditType: 'full' | 'partial' | 'quick';
  status: AuditStatus;
  
  // Configuration
  engineToRun: EngineId[];
  signalTypes: SignalType[];
  
  // Timing
  startedAt?: Date;
  completedAt?: Date;
  durationSeconds?: number;
  
  // Data snapshots
  crawledPages?: CrawledPageData[];
  structuredData?: Record<string, any>;
  aiQueries?: AIQuery[];
  
  // Metadata
  errorMessage?: string;
  errorStack?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SIGNALS & SCORING
// ============================================================================

/**
 * Base interface for all signals
 * Each signal measures a specific aspect of AI visibility
 */
export interface Signal {
  id: string;
  auditId: string;
  engineId: EngineId;
  signalCode: string; // e.g., 'E1.01'
  signalType: SignalType;
  
  name: string;
  description: string;
  
  // Computation results
  rawValue?: any; // Raw metric value (type varies by signal)
  normalizedScore: number; // 0-100
  confidence: number; // 0-1 confidence in this signal
  
  // Evidence & reasoning
  evidence?: Record<string, any>;
  computationDetails?: Record<string, any>;
  
  // AI-assisted fields (Type B)
  aiAssessment?: string; // Claude's text assessment
  aiReasoning?: Record<string, any>;
  
  // Generative observation (Type C)
  aiSystemResponses?: Map<AISystem, AIResponse[]>;
  
  // Cross-source data (Type D)
  crossSourceAlignment?: Record<string, any>;
  
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EngineScore {
  id: string;
  auditId: string;
  engineId: EngineId;
  
  score: number; // 0-100
  signalCount: number;
  signalsMedian: number;
  signalsStdDev: number;
  
  // Signal type breakdown
  typeACount: number;
  typeBCount: number;
  typeCCount: number;
  typeDCount: number;
  
  // Trend
  previousScore?: number;
  scoreChange?: number;
  
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIVisibilityScore {
  id: string;
  auditId: string;
  
  // Final scores by engine (with weights)
  overallScore: number; // 0-100
  retrievalScore: number; // E1, 15%
  entityScore: number; // E2, 15%
  semanticScore: number; // E3, 15%
  authorityScore: number; // E4, 15%
  generativeScore: number; // E5, 20% (highest)
  competitiveScore: number; // E6, 10%
  responseScore: number; // E7, 10%
  
  // Breakdown by signal type
  typeAAverage: number;
  typeBAverage: number;
  typeCAverage: number;
  typeDAverage: number;
  
  // Trend
  previousOverallScore?: number;
  scoreChange?: number;
  
  computedAt: Date;
  createdAt: Date;
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

export interface CrawledPageData {
  url: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  contentLength: number;
  statusCode: number;
  responseTime: number;
  crawlableAsBot: boolean;
  structuredData?: Record<string, any>;
  internalLinks: string[];
  externalLinks: string[];
  imageCount: number;
  scriptCount: number;
  renderableAsBot: boolean;
  crawledAt: Date;
}

export interface AIQuery {
  id: string;
  auditId: string;
  system: AISystem;
  query: string;
  
  response: string;
  modelUsed: string;
  tokensUsed: number;
  
  // Analysis
  mentionsBrand: boolean;
  recommendsBrand: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
  accuracy?: number; // 0-1
  
  executedAt: Date;
  createdAt: Date;
}

export interface ExternalSource {
  linkedin?: {
    companyName: string;
    description?: string;
    industry?: string;
    employees?: number;
    url?: string;
  };
  crunchbase?: {
    name: string;
    description?: string;
    industry?: string;
    foundedYear?: number;
    url?: string;
  };
  wikipedia?: {
    title: string;
    summary?: string;
    url?: string;
  };
  googleKnowledgeGraph?: {
    name: string;
    description?: string;
    imageUrl?: string;
  };
  similarWeb?: {
    traffic?: number;
    rank?: number;
    bounceRate?: number;
  };
}

export interface AIResponse {
  system: AISystem;
  model: string;
  content: string;
  tokensUsed: number;
  executedAt: Date;
}

// ============================================================================
// SIGNAL COMPUTATION INTERFACES
// ============================================================================

/**
 * Result from a Type A signal (deterministic)
 */
export interface TypeAResult {
  passed: boolean;
  metricValue: number | string;
  details?: Record<string, any>;
}

/**
 * Result from a Type B signal (AI-assisted)
 */
export interface TypeBResult {
  assessment: string; // Claude's text assessment
  rating?: number; // 1-10 if applicable
  reasoning: Record<string, any>;
  confidence: number; // 0-1
}

/**
 * Result from a Type C signal (generative observation)
 */
export interface TypeCResult {
  observations: Map<AISystem, TypeCObservation[]>;
  aggregatedMetric: number;
  trend?: 'increasing' | 'stable' | 'decreasing';
}

export interface TypeCObservation {
  query: string;
  mentions: number;
  context: string[];
  sentiment?: string;
}

/**
 * Result from a Type D signal (cross-source reasoning)
 */
export interface TypeDResult {
  sources: Record<string, any>;
  consistency: 'yes' | 'partial' | 'no';
  reasoning: string;
  alignmentScore: number; // 0-100
}

// ============================================================================
// COMPETITIVE ANALYSIS
// ============================================================================

export interface CompetitiveComparison {
  id: string;
  auditId: string;
  organizationId: string;
  competitorId: string;
  
  // Metrics
  shareOfVoice: number; // % of mentions
  aiMentionRatio: number; // org mentions / competitor
  
  // Gaps
  engineScoreGaps: Record<EngineId, number>; // org score - competitor
  signalAdvantages: string[]; // Which signals org leads on
  signalDisadvantages: string[]; // Which signals org lags on
  
  // AI preference
  aiRecommendationPreference: number; // -1 (competitor favored) to 1
  
  computedAt: Date;
  createdAt: Date;
}

// ============================================================================
// SIGNAL DEFINITION
// ============================================================================

/**
 * Base class for all signal computations
 * Implement per signal type
 */
export abstract class BaseSignal {
  abstract code: string;
  abstract name: string;
  abstract description: string;
  abstract type: SignalType;
  abstract engine: EngineId;
  
  /**
   * Compute the signal from available data
   */
  abstract compute(auditData: AuditData): Promise<any>;
  
  /**
   * Convert raw result to 0-100 score
   */
  abstract score(result: any): number;
}

/**
 * Context object passed to signal computations
 */
export interface AuditData {
  audit: Audit;
  organization: Organization;
  crawledPages: CrawledPageData[];
  aiQueries: AIQuery[];
  externalSources?: ExternalSource;
  previousAudit?: Audit; // For trend analysis
}

/**
 * Signal registry for discovering available signals
 */
export interface SignalRegistry {
  getSignal(code: string): BaseSignal;
  getSignalsByEngine(engineId: EngineId): BaseSignal[];
  getSignalsByType(signalType: SignalType): BaseSignal[];
  getAllSignals(): BaseSignal[];
}

// ============================================================================
// SCORING CONFIGURATION
// ============================================================================

export interface ScoringWeights {
  retrieval: number; // E1: 15%
  entity: number; // E2: 15%
  semantic: number; // E3: 15%
  authority: number; // E4: 15%
  generative: number; // E5: 20%
  competitive: number; // E6: 10%
  response: number; // E7: 10%
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  retrieval: 0.15,
  entity: 0.15,
  semantic: 0.15,
  authority: 0.15,
  generative: 0.20,
  competitive: 0.10,
  response: 0.10
};

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface AuditResponse {
  id: string;
  organizationId: string;
  status: AuditStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationSeconds?: number;
  errorMessage?: string;
  scores?: {
    overall: number;
    byEngine: Record<EngineId, number>;
  };
}

export interface SignalResponse {
  code: string;
  name: string;
  type: SignalType;
  score: number;
  confidence: number;
  evidence?: Record<string, any>;
}

export interface ReportData {
  organizationName: string;
  auditDate: Date;
  overallScore: number;
  engineScores: Record<EngineId, number>;
  signals: SignalResponse[];
  recommendations: string[];
  competitivePosition?: {
    rank: number;
    gapToLeader: number;
    topCompetitors: Array<{
      name: string;
      score: number;
      gap: number;
    }>;
  };
}
