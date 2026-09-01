# AI Visibility Platform - MVP Implementation Plan

## EXECUTIVE OVERVIEW

**Project**: AI Visibility Software Platform
**Scope**: Full 7-engine foundation (86 signals) with Phase 1 MVP (60 signals)
**Duration**: 4 months MVP, 8 months full platform
**Team**: 2-3 engineers (backend, full-stack, integrations)

---

## RECOMMENDED TECH STACK

### Backend
- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js or Fastify (microservices-ready)
- **Language**: TypeScript (for signal definitions and type safety)
- **Job Queue**: Bull/BullMQ (Redis-backed) for async signal computation
- **CLI Tools**: Playwright (web crawling), Cheerio (HTML parsing)

### Frontend
- **Framework**: React 18+ with TypeScript
- **State Management**: TanStack Query + Zustand
- **UI Component Library**: shadcn/ui (Tailwind-based)
- **Visualization**: Recharts (signal metrics), Nivo (competitive charts)
- **Styling**: Tailwind CSS

### Database
- **Primary**: PostgreSQL 15+
  - Structured data: audits, signals, scores, organizations
  - Time-series: signal computation history
  - JSON fields: signal metadata, AI responses
- **Cache**: Redis 7+ 
  - Signal computation results
  - Session management
  - Rate limiting

### Infrastructure
- **Container**: Docker + Docker Compose (dev), Kubernetes (production)
- **API Gateway**: Nginx or AWS API Gateway
- **Storage**: S3 or similar for audit reports, screenshots
- **Monitoring**: Prometheus + Grafana (metrics), Winston (logging)
- **CI/CD**: GitHub Actions

### AI Integrations
- **LLM APIs**: OpenAI, Anthropic (Claude), Google Gemini, Perplexity
- **Web APIs**: Common crawl archives, Brave Search API
- **Data Sources**: Similar Web API, Crunchbase API (optional)

---

## SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway / Auth Layer                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
├─ Backend Services ─────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Audit Service   │  │  Signal Engine   │  │ Score Engine │  │
│  │  (orchestration) │  │  (computation)   │  │ (aggregation)│  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│         │                      │                     │            │
│         └──────────┬───────────┴─────────────────────┘            │
│                    │                                              │
│  ┌────────────────────────────────────────────────────┐          │
│  │     Signal Computation Engines                     │          │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │          │
│  │ │ E1 Ret.  │ │ E2 Ent.  │ │ E3-E7 Processors │   │          │
│  │ │ (Type A) │ │ (Type D) │ │ (Mixed Types)    │   │          │
│  │ └──────────┘ └──────────┘ └──────────────────┘   │          │
│  └────────────────────────────────────────────────────┘          │
│         │                                                         │
│  ┌────────────────────────────────────────────────────┐          │
│  │     Integration Layer                              │          │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │          │
│  │ │Web Crawl │ │AI System │ │Entity Resolution │   │          │
│  │ │(Playwright)│Queries    │(Disambiguation)  │   │          │
│  │ └──────────┘ └──────────┘ └──────────────────┘   │          │
│  └────────────────────────────────────────────────────┘          │
│         │                                                         │
│  ┌─────────────────────┬──────────────────┬────────────────┐    │
│  │  PostgreSQL DB      │   Redis Cache    │   Job Queue    │    │
│  │  (persistent state) │  (performance)   │ (async work)   │    │
│  └─────────────────────┴──────────────────┴────────────────┘    │
│                                                                   │
├─ Frontend ────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React SPA                                               │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐  │  │
│  │  │ Audit List │ │ Audit View │ │ Competitive View   │  │  │
│  │  │ & Details  │ │ + Signals  │ │ + Benchmarking     │  │  │
│  │  └────────────┘ └────────────┘ └────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │ Dashboards: Scores, Engines, Signals, Trends   │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## PROJECT STRUCTURE

```
ai-visibility/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts       # PostgreSQL connection
│   │   │   ├── redis.ts          # Redis client
│   │   │   └── env.ts            # Environment variables
│   │   │
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── audits.ts     # Audit CRUD
│   │   │   │   ├── signals.ts    # Signal retrieval
│   │   │   │   ├── scores.ts     # Score aggregation
│   │   │   │   └── auth.ts       # Authentication
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── errorHandler.ts
│   │   │   └── app.ts            # Express setup
│   │   │
│   │   ├── core/
│   │   │   ├── engines/          # Signal computation engines
│   │   │   │   ├── engine1-retrieval.ts
│   │   │   │   ├── engine2-entity.ts
│   │   │   │   ├── engine3-semantic.ts
│   │   │   │   ├── engine4-authority.ts
│   │   │   │   ├── engine5-generative.ts
│   │   │   │   ├── engine6-competitive.ts
│   │   │   │   └── engine7-response.ts
│   │   │   │
│   │   │   ├── signals/          # Individual signal computations
│   │   │   │   ├── typeA/        # Deterministic signals
│   │   │   │   │   ├── crawlability.ts
│   │   │   │   │   ├── robotsFile.ts
│   │   │   │   │   ├── sitemap.ts
│   │   │   │   │   ├── schemaValidity.ts
│   │   │   │   │   └── ...
│   │   │   │   │
│   │   │   │   ├── typeB/        # AI-assisted signals
│   │   │   │   │   ├── coreTopicClarity.ts
│   │   │   │   │   ├── audienceDefinition.ts
│   │   │   │   │   ├── problemDefinition.ts
│   │   │   │   │   └── ...
│   │   │   │   │
│   │   │   │   ├── typeC/        # Generative observation
│   │   │   │   │   ├── aiMentionRate.ts
│   │   │   │   │   ├── aiRecommendationRate.ts
│   │   │   │   │   ├── aiSentiment.ts
│   │   │   │   │   └── ...
│   │   │   │   │
│   │   │   │   └── typeD/        # Cross-source reasoning
│   │   │   │       ├── entityConsistency.ts
│   │   │   │       ├── claimEvidenceAlignment.ts
│   │   │   │       └── ...
│   │   │   │
│   │   │   ├── scoring/
│   │   │   │   ├── signalScorer.ts    # 0-100 normalization
│   │   │   │   ├── engineScorer.ts    # Aggregate to engine level
│   │   │   │   └── overallScorer.ts   # Final AI Visibility score
│   │   │   │
│   │   │   └── audit-orchestrator.ts  # Coordinates entire audit
│   │   │
│   │   ├── integrations/
│   │   │   ├── web/
│   │   │   │   ├── playwright.ts      # Web crawling
│   │   │   │   ├── parser.ts          # HTML/content parsing
│   │   │   │   └── schemaExtractor.ts # Extract structured data
│   │   │   │
│   │   │   ├── ai-systems/
│   │   │   │   ├── openai.ts          # ChatGPT API
│   │   │   │   ├── anthropic.ts       # Claude API
│   │   │   │   ├── google.ts          # Gemini API
│   │   │   │   └── perplexity.ts      # Perplexity API
│   │   │   │
│   │   │   └── data-sources/
│   │   │       ├── similarweb.ts      # (optional)
│   │   │       ├── crunchbase.ts      # (optional)
│   │   │       └── commonCrawl.ts     # (optional)
│   │   │
│   │   ├── models/
│   │   │   ├── audit.ts
│   │   │   ├── signal.ts
│   │   │   ├── score.ts
│   │   │   ├── organization.ts
│   │   │   └── user.ts
│   │   │
│   │   ├── services/
│   │   │   ├── auditService.ts
│   │   │   ├── organizationService.ts
│   │   │   ├── reportService.ts       # Generate audit reports
│   │   │   └── competitiveService.ts  # Compare vs competitors
│   │   │
│   │   ├── jobs/
│   │   │   ├── auditJobProcessor.ts   # Queue worker
│   │   │   └── signalJobProcessor.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── cache.ts
│   │   │   ├── validation.ts
│   │   │   └── helpers.ts
│   │   │
│   │   └── index.ts                  # Entry point
│   │
│   ├── migrations/
│   │   └── [database schema versions]
│   │
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   │
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuditList/
│   │   │   ├── AuditDetail/
│   │   │   ├── SignalsDashboard/
│   │   │   ├── ScoreCard/
│   │   │   ├── CompetitiveBench/
│   │   │   ├── ReportGenerator/
│   │   │   └── shared/
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── AuditPage.tsx
│   │   │   ├── CompetitiveAnalysis.tsx
│   │   │   └── Settings.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAudit.ts
│   │   │   ├── useSignals.ts
│   │   │   ├── useScores.ts
│   │   │   └── useCompetitive.ts
│   │   │
│   │   ├── services/
│   │   │   └── api.ts              # API client
│   │   │
│   │   ├── store/
│   │   │   ├── auditStore.ts
│   │   │   └── uiStore.ts
│   │   │
│   │   ├── types/
│   │   │   ├── audit.ts
│   │   │   ├── signal.ts
│   │   │   ├── score.ts
│   │   │   └── api.ts
│   │   │
│   │   ├── App.tsx
│   │   └── index.tsx
│   │
│   ├── public/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── README.md
│
├── docker-compose.yml
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── deploy.yml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SIGNALS.md
│   └── DEPLOYMENT.md
└── README.md
```

---

## DATABASE SCHEMA (PostgreSQL)

### Core Tables

```sql
-- Organizations being audited
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  description TEXT,
  industry VARCHAR(100),
  founded_year INTEGER,
  website_url VARCHAR(500),
  
  -- Entity identity tracking
  entity_type VARCHAR(50), -- 'company', 'product', 'service'
  entity_names JSONB, -- {official, aliases, variations}
  locations JSONB, -- {primary, secondary, offices}
  
  -- Ownership relationships
  parent_organization UUID REFERENCES organizations(id),
  brand_relationships JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audits (each run of the AI Visibility assessment)
CREATE TABLE audits (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  audit_type VARCHAR(50), -- 'full', 'partial', 'quick'
  status VARCHAR(20), -- 'queued', 'running', 'completed', 'failed'
  
  -- Configuration
  engines_to_run JSONB, -- which engines to run
  signal_types JSONB, -- which signal types to include
  
  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Crawler snapshot
  crawled_pages JSONB, -- metadata about crawled pages
  structured_data JSONB, -- extracted schema.org data
  
  -- AI query results snapshot
  ai_queries JSONB, -- queries executed across AI systems
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual signal computations
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id),
  engine_id VARCHAR(10), -- 'E1', 'E2', etc.
  signal_code VARCHAR(20), -- 'E1.01', 'E1.02', etc.
  signal_type VARCHAR(10), -- 'A', 'B', 'C', 'D'
  
  -- Computation
  raw_value FLOAT, -- raw metric value
  normalized_score FLOAT CHECK (normalized_score >= 0 AND normalized_score <= 100),
  confidence FLOAT, -- 0-1 confidence in this signal
  
  -- Evidence
  evidence JSONB, -- supporting data for the signal
  computation_details JSONB, -- how score was calculated
  
  -- AI-assisted fields (Type B signals)
  ai_assessment TEXT, -- Claude/GPT assessment
  ai_reasoning JSONB, -- why the signal scored this way
  
  -- Generative observation (Type C signals)
  ai_system_responses JSONB, -- responses from ChatGPT, Claude, etc.
  
  -- Cross-source data (Type D signals)
  cross_source_alignment JSONB, -- consistency across sources
  
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(audit_id, signal_code)
);

-- Engine-level scores (aggregates of signals)
CREATE TABLE engine_scores (
  id UUID PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id),
  engine_id VARCHAR(10) UNIQUE NOT NULL, -- 'E1', 'E2', etc.
  
  score FLOAT CHECK (score >= 0 AND score <= 100),
  signal_count INTEGER,
  signals_median FLOAT,
  signals_std_dev FLOAT,
  
  -- Composition
  type_a_count INTEGER, -- how many Type A signals in this engine
  type_b_count INTEGER,
  type_c_count INTEGER,
  type_d_count INTEGER,
  
  -- Trend
  previous_score FLOAT, -- from last audit
  score_change FLOAT,
  
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Overall AI Visibility score (weighted aggregate)
CREATE TABLE ai_visibility_scores (
  id UUID PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) UNIQUE,
  
  -- Final score
  overall_score FLOAT CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Engine contributions (with weights)
  retrieval_score FLOAT, -- E1, weight 15%
  entity_score FLOAT, -- E2, weight 15%
  semantic_score FLOAT, -- E3, weight 15%
  authority_score FLOAT, -- E4, weight 15%
  generative_score FLOAT, -- E5, weight 20%
  competitive_score FLOAT, -- E6, weight 10%
  response_score FLOAT, -- E7, weight 10%
  
  -- Breakdown by signal type
  type_a_average FLOAT,
  type_b_average FLOAT,
  type_c_average FLOAT,
  type_d_average FLOAT,
  
  -- Trend
  previous_overall_score FLOAT,
  score_change FLOAT,
  
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Competitive benchmarking
CREATE TABLE competitive_comparisons (
  id UUID PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id),
  
  organization_id UUID NOT NULL REFERENCES organizations(id),
  competitor_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Share of voice
  share_of_voice FLOAT, -- % of mentions for org vs competitor
  ai_mention_ratio FLOAT, -- org mentions / competitor mentions
  
  -- Positioning gaps
  engine_score_gaps JSONB, -- {E1: 5.2, E2: -3.1, ...}
  signal_advantages JSONB, -- which signals org leads on
  signal_disadvantages JSONB, -- which signals org lags on
  
  -- Recommendation preference
  ai_recommendation_preference FLOAT, -- -1 (competitor favored) to 1 (org favored)
  
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit reports (generated artifacts)
CREATE TABLE audit_reports (
  id UUID PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id),
  
  report_type VARCHAR(50), -- 'executive', 'detailed', 'competitive'
  format VARCHAR(20), -- 'pdf', 'html', 'json'
  
  file_path VARCHAR(500), -- S3 or local path
  file_size_bytes INTEGER,
  
  generated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit history/trends
CREATE TABLE signal_history (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  signal_code VARCHAR(20), -- 'E1.01', etc.
  
  audit_id UUID NOT NULL REFERENCES audits(id),
  score FLOAT,
  timestamp TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audits_org ON audits(organization_id, created_at DESC);
CREATE INDEX idx_signals_audit ON signals(audit_id);
CREATE INDEX idx_signals_engine ON signals(engine_id);
CREATE INDEX idx_engine_scores_audit ON engine_scores(audit_id);
CREATE INDEX idx_signal_history_org ON signal_history(organization_id, signal_code);
CREATE INDEX idx_competitive_comps ON competitive_comparisons(audit_id, organization_id);
```

---

## API SPECIFICATION

### Core Endpoints

#### Audits
```
POST   /api/v1/audits                    # Start new audit
GET    /api/v1/audits/:id                # Get audit details
GET    /api/v1/audits                    # List audits (paginated)
DELETE /api/v1/audits/:id                # Delete audit
POST   /api/v1/audits/:id/retry          # Retry failed audit
```

#### Signals
```
GET    /api/v1/audits/:id/signals        # Get all signals for audit
GET    /api/v1/audits/:id/signals/:code  # Get specific signal
GET    /api/v1/audits/:id/signals/engine/:engineId
```

#### Scores
```
GET    /api/v1/audits/:id/scores         # Get all engine scores
GET    /api/v1/audits/:id/scores/overall # Get AI Visibility score
GET    /api/v1/audits/:id/scores/trend   # Historical trend
```

#### Competitive
```
POST   /api/v1/audits/:id/competitors    # Add competitor for comparison
GET    /api/v1/audits/:id/competitive    # Get competitive analysis
GET    /api/v1/audits/:id/competitive/share-of-voice
```

#### Organizations
```
POST   /api/v1/organizations             # Create org
GET    /api/v1/organizations/:id         # Get org details
PUT    /api/v1/organizations/:id         # Update org
```

#### Reports
```
POST   /api/v1/audits/:id/reports        # Generate report
GET    /api/v1/audits/:id/reports        # List reports
GET    /api/v1/audits/:id/reports/:id/download
```

---

## SIGNAL ENGINE ARCHITECTURE

### Type A Signals (Deterministic)
```typescript
interface TypeASignal {
  code: string; // 'E1.01'
  name: string;
  description: string;
  
  // Automated computation
  compute(auditData: AuditData): Promise<TypeAResult>;
  
  // Deterministic scoring (0-100)
  score(result: TypeAResult): number;
}

// Example: E1.01 - AI Crawl Accessibility
class CrawlAccessibilitySignal extends TypeASignal {
  async compute(auditData: AuditData) {
    // Use Playwright to check if /robots.txt is accessible
    // Check if major AI crawlers (GPTBot, Anthropic-AI, Googlebot) are allowed
    // Measure response times
    return {
      accessible: boolean,
      allowedCrawlers: string[],
      responseTime: number,
      statusCode: number
    };
  }
  
  score(result): number {
    // If accessible AND GPTBot allowed = 100
    // If accessible BUT restricted = 60
    // If not accessible = 0
  }
}
```

### Type B Signals (AI-Assisted)
```typescript
interface TypeBSignal {
  code: string;
  name: string;
  
  // AI-assisted computation
  async compute(auditData: AuditData, claude: AnthropicClient): Promise<TypeBResult>;
  
  // Claude assessment
  async assessWithClaude(
    data: any,
    prompt: string,
    claude: AnthropicClient
  ): Promise<TypeBAssessment>;
  
  score(assessment: TypeBAssessment): number;
}

// Example: E3.01 - Core Topic Clarity
class CoreTopicClaritySignal extends TypeBSignal {
  async compute(auditData: AuditData, claude: AnthropicClient) {
    const websiteContent = auditData.crawledPages.homepage;
    
    const prompt = `
      Based on this website content, how clearly does the company communicate
      its core topic/offering? Rate clarity on scale 1-10.
      
      Content:
      ${websiteContent}
    `;
    
    return await this.assessWithClaude(websiteContent, prompt, claude);
  }
  
  score(assessment: TypeBAssessment): number {
    // Convert Claude's 1-10 rating to 0-100
    return assessment.rating * 10;
  }
}
```

### Type C Signals (Generative Observation)
```typescript
interface TypeCSignal {
  code: string;
  name: string;
  
  // Query AI systems and observe responses
  async compute(
    org: Organization,
    aiClients: AIClientMap
  ): Promise<TypeCResult>;
  
  // Execute queries against multiple AI systems
  async queryAISystems(
    org: Organization,
    queries: string[],
    aiClients: AIClientMap
  ): Promise<Map<string, AIResponse[]>>;
  
  score(result: TypeCResult): number;
}

// Example: E5.01 - AI Brand Mention Rate
class AIBrandMentionRateSignal extends TypeCSignal {
  async compute(org: Organization, aiClients: AIClientMap) {
    const queries = [
      `Tell me about ${org.name}`,
      `What is ${org.name}?`,
      `Recommend companies in ${org.industry} category`,
      // ... more queries
    ];
    
    const responses = await this.queryAISystems(org, queries, aiClients);
    
    // Count mentions across all responses
    const mentionCounts = {};
    for (const [system, results] of responses) {
      mentionCounts[system] = results.filter(r => 
        r.content.toLowerCase().includes(org.name.toLowerCase())
      ).length;
    }
    
    return { mentionCounts, totalQueries: queries.length };
  }
  
  score(result: TypeCResult): number {
    // Mention rate = mentions / total queries
    const avgMentions = Object.values(result.mentionCounts).reduce((a, b) => a + b, 0) 
      / Object.keys(result.mentionCounts).length;
    return (avgMentions / result.totalQueries) * 100;
  }
}
```

### Type D Signals (Cross-Source Reasoning)
```typescript
interface TypeDSignal {
  code: string;
  name: string;
  
  // Analyze consistency across multiple sources
  async compute(
    org: Organization,
    auditData: AuditData,
    externalSources: ExternalData,
    claude: AnthropicClient
  ): Promise<TypeDResult>;
  
  score(result: TypeDResult): number;
}

// Example: E2.02 - Entity Name Consistency
class EntityNameConsistencySignal extends TypeDSignal {
  async compute(org, auditData, externalSources, claude) {
    // Collect organization names from multiple sources
    const sources = {
      website: auditData.entityName,
      linkedin: externalSources.linkedin.companyName,
      crunchbase: externalSources.crunchbase.name,
      wikipedia: externalSources.wikipedia.title,
      googleKnowledgeGraph: externalSources.googleKG.name
    };
    
    // Check consistency
    const prompt = `
      Analyze if these company names refer to the same entity:
      ${JSON.stringify(sources, null, 2)}
      
      Are they consistent representations? (yes/no/partial)
      What variations exist?
    `;
    
    const analysis = await claude.complete(prompt);
    
    return {
      sources,
      consistency: analysis.consistency,
      reasoning: analysis.reasoning
    };
  }
  
  score(result: TypeDResult): number {
    // Consistent = 100, Partial = 60, Inconsistent = 0
    const scores = {
      'yes': 100,
      'partial': 60,
      'no': 0
    };
    return scores[result.consistency] || 0;
  }
}
```

---

## IMPLEMENTATION PHASES

### Phase 0: Foundation (Weeks 1-2)
- [ ] Set up project structure, Docker Compose, CI/CD
- [ ] Create database schema and migrations
- [ ] Implement auth/API middleware
- [ ] Create organization and audit models
- [ ] Set up Redis and job queue
- [ ] Deploy basic React frontend scaffold

### Phase 1: MVP - Engine 1 (Retrieval) (Weeks 3-6)
- [ ] Implement Playwright web crawler
- [ ] Build all Type A signals (E1)
- [ ] Create signal scorer infrastructure
- [ ] Build signal dashboard UI
- [ ] Implement job queue for crawl jobs
- [ ] Add logging and error handling

### Phase 2: Entity Engine (Weeks 7-10)
- [ ] Implement entity extraction from pages
- [ ] Build external entity source integrations (LinkedIn, Crunchbase API)
- [ ] Implement Type D signal computation
- [ ] Build entity consistency checker with Claude
- [ ] Create entity dashboard UI

### Phase 3: Semantic Engine (Weeks 11-14)
- [ ] Implement semantic analysis with Claude
- [ ] Build Type B signal infrastructure
- [ ] Create content understanding layer
- [ ] Build semantic dashboard UI

### Phase 4: Authority Engine (Weeks 15-18)
- [ ] Implement third-party source crawling
- [ ] Build evidence aggregation system
- [ ] Create authority dashboard UI
- [ ] Add search/media mention integration

### Phase 5: Generative Perception (Weeks 19-22)
- [ ] Integrate OpenAI, Anthropic, Google, Perplexity APIs
- [ ] Build Type C signal infrastructure
- [ ] Implement AI response analysis
- [ ] Create perception dashboard UI
- [ ] Add sentiment analysis

### Phase 6: Scoring & Reporting (Weeks 23-26)
- [ ] Implement engine scorers with weighting
- [ ] Build overall AI Visibility score calculation
- [ ] Create report generation engine
- [ ] Build report dashboard UI
- [ ] Implement PDF/HTML export

### Phase 7: Competitive Intelligence (Weeks 27-30)
- [ ] Add competitor comparison logic
- [ ] Build share-of-voice calculation
- [ ] Create competitive benchmarking UI
- [ ] Add competitive trends

### Phase 8: Polish & Launch (Weeks 31+)
- [ ] Performance optimization
- [ ] Security audit and hardening
- [ ] Load testing
- [ ] Documentation
- [ ] MVP launch with pilot customers

---

## DEPENDENCIES & PACKAGE MANAGEMENT

### Core Backend Dependencies
```json
{
  "express": "^4.18.2",
  "fastify": "^4.25.0",
  "typescript": "^5.3.0",
  "pg": "^8.11.0",
  "redis": "^4.6.0",
  "bull": "^4.11.0",
  "playwright": "^1.40.0",
  "cheerio": "^1.0.0-rc.12",
  "axios": "^1.6.2",
  "dotenv": "^16.3.1",
  "winston": "^3.11.0",
  "joi": "^17.11.0"
}
```

### AI Integration Libraries
```json
{
  "openai": "^4.28.0",
  "@anthropic-ai/sdk": "^0.9.0",
  "@google-cloud/generative-ai": "^0.1.0"
}
```

### Frontend Dependencies
```json
{
  "react": "^18.2.0",
  "react-router-dom": "^6.20.0",
  "@tanstack/react-query": "^5.28.0",
  "zustand": "^4.4.0",
  "recharts": "^2.10.0",
  "@nivo/core": "^0.80.0",
  "tailwindcss": "^3.4.0",
  "shadcn/ui": "latest"
}
```

---

## DEPLOYMENT ARCHITECTURE

### Local Development
```bash
docker-compose up
# Runs: PostgreSQL, Redis, backend, frontend
```

### Production (AWS)
- **API**: ECS/Fargate or EC2 instances
- **Database**: RDS PostgreSQL
- **Cache**: ElastiCache (Redis)
- **Job Queue**: SQS + Lambda or ECS tasks
- **Frontend**: CloudFront + S3 or AppRunner
- **Storage**: S3 for reports
- **Monitoring**: CloudWatch + Prometheus

### Key Considerations
- Horizontal scaling for signal computation (stateless workers)
- API rate limiting for AI system queries
- Database connection pooling
- Redis for caching computation results
- Async job processing for long-running audits

---

## SECURITY CONSIDERATIONS

1. **API Authentication**: JWT tokens with refresh rotation
2. **Database**: Encryption at rest, encrypted connections
3. **Secrets Management**: AWS Secrets Manager or HashiCorp Vault
4. **Input Validation**: Joi schemas on all inputs
5. **AI API Keys**: Never exposed to frontend
6. **CORS**: Restricted to registered domains
7. **Rate Limiting**: Per-user and per-IP
8. **Audit Logging**: All signal computations logged

---

## TESTING STRATEGY

### Unit Tests
- Individual signal computation logic
- Scorer functions
- Helper utilities

### Integration Tests
- Full audit flow end-to-end
- API endpoint validation
- Database interactions
- Signal computation with mocked external APIs

### E2E Tests
- User workflow: create org → run audit → view results
- Export report
- Competitive comparison

### Load Testing
- Simulate 1000+ concurrent audits
- Measure signal computation performance
- Database query performance

---

## MONITORING & OBSERVABILITY

### Metrics
- Audit completion time (by engine)
- Signal computation time (by type)
- API response times
- Job queue depth
- Database connection pool status
- AI API quota usage

### Logs
- Structured JSON logging (Winston)
- Per-audit trace IDs for correlation
- Signal computation details
- Error stack traces

### Dashboards
- Grafana dashboards for ops team
- In-app dashboard for users

---

## NEXT STEPS

1. **Week 1**: Set up project skeleton, Docker Compose, CI/CD pipelines
2. **Week 2**: Implement database schema, create core models
3. **Week 3**: Build API scaffolding, auth, core services
4. **Week 4**: Implement Playwright web crawler
5. **Week 5-6**: Build all Type A signals and signal scoring
6. **Week 7+**: Continue with Phase 2 (Entity Intelligence)

This architecture supports all 7 engines from day 1 while focusing MVP delivery on Phase 1 (60 signals).
