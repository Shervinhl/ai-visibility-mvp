/**
 * Core type definitions for AI Visibility platform
 */

export enum SignalType {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export enum EngineId {
  E1 = 'E1',
  E2 = 'E2',
  E3 = 'E3',
  E4 = 'E4',
  E5 = 'E5',
  E6 = 'E6',
  E7 = 'E7',
}

export enum AuditStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

export enum AISystem {
  CHATGPT = 'chatgpt',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  PERPLEXITY = 'perplexity',
}

// ============================================================================
// ORGANIZATION
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  foundedYear?: number;
  websiteUrl?: string;
  entityType?: 'company' | 'product' | 'service';
  entityNames?: Record<string, any>;
  locations?: Record<string, any>;
  parentOrganization?: string;
  brandRelationships?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// AUDIT
// ============================================================================

export interface Audit {
  id: string;
  organizationId: string;
  auditType: 'full' | 'partial' | 'quick';
  status: AuditStatus;
  engineToRun: EngineId[];
  signalTypes: SignalType[];
  startedAt?: Date;
  completedAt?: Date;
  durationSeconds?: number;
  crawledPages?: CrawledPageData[];
  structuredData?: Record<string, any>;
  aiQueries?: AIQuery[];
  errorMessage?: string;
  errorStack?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SIGNALS
// ============================================================================

export interface Signal {
  id: string;
  auditId: string;
  engineId: EngineId;
  signalCode: string;
  signalType: SignalType;
  name: string;
  description: string;
  rawValue?: any;
  normalizedScore: number;
  confidence: number;
  evidence?: Record<string, any>;
  computationDetails?: Record<string, any>;
  aiAssessment?: string;
  aiReasoning?: Record<string, any>;
  aiSystemResponses?: Record<string, any>;
  crossSourceAlignment?: Record<string, any>;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EngineScore {
  id: string;
  auditId: string;
  engineId: EngineId;
  score: number;
  signalCount: number;
  signalsMedian: number;
  signalsStdDev: number;
  typeACount: number;
  typeBCount: number;
  typeCCount: number;
  typeDCount: number;
  previousScore?: number;
  scoreChange?: number;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIVisibilityScore {
  id: string;
  auditId: string;
  overallScore: number;
  retrievalScore: number;
  entityScore: number;
  semanticScore: number;
  authorityScore: number;
  generativeScore: number;
  competitiveScore: number;
  responseScore: number;
  typeAAverage: number;
  typeBAverage: number;
  typeCAverage: number;
  typeDAverage: number;
  previousOverallScore?: number;
  scoreChange?: number;
  computedAt: Date;
  createdAt: Date;
}

// ============================================================================
// WEB DATA
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
  mentionsBrand: boolean;
  recommendsBrand: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
  accuracy?: number;
  executedAt: Date;
  createdAt: Date;
}

// ============================================================================
// SIGNAL COMPUTATION
// ============================================================================

export interface AuditData {
  audit: Audit;
  organization: Organization;
  crawledPages: CrawledPageData[];
  aiQueries: AIQuery[];
  externalSources?: Record<string, any>;
  previousAudit?: Audit;
}

export interface SignalResult {
  passed: boolean;
  metricValue: number | string;
  details?: Record<string, any>;
}

// ============================================================================
// API RESPONSES
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
  engine: EngineId;
  score: number;
  confidence: number;
  evidence?: Record<string, any>;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: Date;
}
