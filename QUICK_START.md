# AI Visibility Platform - Quick Start Guide

## 🚀 Getting Started (5 minutes)

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git
- API Keys (Anthropic, OpenAI, Google - optional for initial dev)

### 1. Clone & Setup

```bash
# Clone the repository
git clone <repo-url>
cd ai-visibility

# Copy environment template
cp .env.example .env

# Update .env with your API keys
# (Minimal setup: just set ANTHROPIC_API_KEY for Type B signals)
```

### 2. Start the Stack

```bash
# Start all services (Postgres, Redis, Backend, Frontend, Worker)
docker-compose up

# Alternatively, start just database services for local development
docker-compose up postgres redis
```

### 3. Verify Services

```bash
# Backend API
curl http://localhost:4000/health

# Frontend
open http://localhost:3000

# pgAdmin (Database UI)
open http://localhost:5050
# Login: admin@aivisibility.local / admin

# Redis Commander
open http://localhost:8081
```

---

## 📁 Project Structure Quick Reference

```
backend/
├── src/
│   ├── core/
│   │   ├── engines/          # E1-E7 engine coordinators
│   │   ├── signals/          # Individual signal implementations
│   │   │   ├── typeA/       # Deterministic (automated)
│   │   │   ├── typeB/       # AI-assisted (Claude)
│   │   │   ├── typeC/       # Generative (query AI systems)
│   │   │   └── typeD/       # Cross-source reasoning
│   │   ├── scoring/         # Score aggregation
│   │   └── audit-orchestrator.ts
│   ├── integrations/        # External APIs (web crawlers, AI systems)
│   ├── api/                 # REST endpoints
│   └── models/              # Database models
frontend/
├── src/
│   ├── components/
│   │   ├── AuditList/
│   │   ├── AuditDetail/
│   │   ├── SignalsDashboard/
│   │   └── ScoreCard/
│   ├── pages/
│   └── types/
```

---

## 🔑 Key Files to Know

### Core Files

| File | Purpose |
|------|---------|
| `signal-types.ts` | Type definitions for all signals & scoring |
| `sample-signal-implementations.ts` | Example implementations (copy & extend) |
| `backend-package.json` | Dependencies |
| `docker-compose.yml` | Local dev environment |

### Database

| File | Purpose |
|------|---------|
| `backend/migrations/init.sql` | Schema initialization |
| `backend/migrations/001_*.sql` | Schema migrations (create these as you add tables) |

### Backend Services

| Path | Purpose |
|------|---------|
| `src/api/routes/audits.ts` | Audit CRUD endpoints |
| `src/core/audit-orchestrator.ts` | Coordinates entire audit workflow |
| `src/jobs/auditJobProcessor.ts` | Worker processes async audit jobs |

---

## 🛠️ Development Workflow

### 1. Implementing a New Signal

```typescript
// File: backend/src/core/signals/typeA/newSignal.ts
import { BaseSignal, SignalType, EngineId, AuditData, TypeAResult } from '@/signal-types';

export class NewSignal extends BaseSignal {
  code = 'E1.XX';  // Replace XX with signal number
  name = 'Signal Name';
  description = 'What this signal measures';
  type = SignalType.A;  // or B, C, D
  engine = EngineId.E1;  // E1-E7
  
  async compute(auditData: AuditData): Promise<TypeAResult> {
    // Implement signal computation
    return {
      passed: true,
      metricValue: 100,
      details: { /* evidence */ }
    };
  }
  
  score(result: TypeAResult): number {
    // Convert metric to 0-100 score
    return result.metricValue as number;
  }
}
```

### 2. Running an Audit

```bash
# Via API
curl -X POST http://localhost:4000/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "My Company",
    "domain": "mycompany.com",
    "enginesToRun": ["E1", "E2", "E3", "E4", "E5"],
    "auditType": "full"
  }'
```

### 3. Viewing Results

```bash
# Get audit status
curl http://localhost:4000/api/v1/audits/{auditId}

# Get all signals
curl http://localhost:4000/api/v1/audits/{auditId}/signals

# Get engine scores
curl http://localhost:4000/api/v1/audits/{auditId}/scores

# Get overall score
curl http://localhost:4000/api/v1/audits/{auditId}/scores/overall
```

---

## 📋 Development Checklist by Phase

### Phase 0: Foundation (Weeks 1-2)

- [ ] Project initialization
  ```bash
  npm init -y
  npm install (dependencies from backend-package.json)
  npx tsc --init (use backend-tsconfig.json)
  ```

- [ ] Docker setup
  ```bash
  docker-compose up postgres redis
  npx ts-node backend/migrations/init.sql (seed database)
  ```

- [ ] Basic API scaffolding
  - [ ] Create `src/api/app.ts` (Express setup)
  - [ ] Create `src/api/routes/audits.ts` (CRUD routes)
  - [ ] Create `src/config/database.ts` (PostgreSQL connection)
  - [ ] Create `src/config/redis.ts` (Redis connection)

- [ ] Authentication
  - [ ] Implement JWT token generation
  - [ ] Implement auth middleware
  - [ ] Create login/register endpoints

- [ ] Frontend scaffold
  ```bash
  npx create-react-app frontend
  # Copy Tailwind, shadcn/ui setup
  ```

### Phase 1: Retrieval Intelligence Engine (E1) (Weeks 3-6)

**Goal**: Implement all 12 Type A signals for E1

- [ ] Web Crawler
  - [ ] Setup Playwright in `src/integrations/web/playwright.ts`
  - [ ] Implement robots.txt checking
  - [ ] Implement sitemap parsing
  - [ ] Implement page discovery & crawl depth tracking

- [ ] Type A Signals
  - [ ] E1.01 - AI Crawl Accessibility
  - [ ] E1.02 - Robots Accessibility
  - [ ] E1.03 - Sitemap Discoverability
  - [ ] E1.04 - Important Page Discoverability
  - [ ] E1.05 - Crawl Depth to Important Content
  - [ ] E1.06 - Internal Semantic Linking
  - [ ] E1.07 - Content Rendering Accessibility
  - [ ] E1.08 - Machine-Readable Content Ratio
  - [ ] E1.09 - Structured Data Coverage
  - [ ] E1.10 - Structured Data Validity
  - [ ] E1.11 - Canonical Consistency
  - [ ] E1.12 - Content Freshness Accessibility

- [ ] Scoring
  - [ ] Implement `src/core/scoring/signalScorer.ts`
  - [ ] Implement `src/core/scoring/engineScorer.ts`
  - [ ] Test signal scoring normalization (0-100)

- [ ] Frontend
  - [ ] Create audit creation form
  - [ ] Create signals dashboard showing E1 results
  - [ ] Create signal detail view

### Phase 2: Entity Intelligence Engine (E2) (Weeks 7-10)

**Goal**: Implement all 12 Type D signals for E2

- [ ] Entity Extraction
  - [ ] Setup entity extraction from crawled pages
  - [ ] Implement name/type/location extraction

- [ ] External Source Integration
  - [ ] LinkedIn API (optional: use public data)
  - [ ] Crunchbase API (optional)
  - [ ] Wikipedia data (scrape or API)
  - [ ] Google Knowledge Graph (scrape or API)

- [ ] Type D Signals
  - [ ] E2.01 - Entity Identification Clarity
  - [ ] E2.02 - Entity Name Consistency
  - [ ] E2.03 - Entity Type Consistency
  - [ ] E2.04 - Organization Identity Completeness
  - [ ] E2.05 - Entity Location Consistency
  - [ ] E2.06 - Brand-Organization Relationship
  - [ ] E2.07 - Product-Brand Relationship Clarity
  - [ ] E2.08 - Service-Brand Relationship Clarity
  - [ ] E2.09 - Person-Organization Relationship
  - [ ] E2.10 - Entity Attribute Consistency
  - [ ] E2.11 - External Entity Consistency
  - [ ] E2.12 - Entity Disambiguation Strength

- [ ] Claude Integration
  - [ ] Setup Anthropic SDK in `src/integrations/ai-systems/anthropic.ts`
  - [ ] Implement entity consistency checking prompts
  - [ ] Add error handling & retries

### Phase 3: Semantic Understanding Engine (E3) (Weeks 11-14)

**Goal**: Implement 12 Type B signals for E3

- [ ] Type B Signal Infrastructure
  - [ ] Create base implementation for Type B signals
  - [ ] Implement prompt templates for semantic analysis
  - [ ] Add Claude integration for semantic evaluation

- [ ] Type B Signals
  - [ ] E3.01 - Core Topic Clarity
  - [ ] E3.02 - Primary Category Clarity
  - [ ] E3.03 - Product/Service Definition Clarity
  - [ ] E3.04 - Audience Definition Clarity
  - [ ] E3.05 - Problem Definition Clarity
  - [ ] E3.06 - Solution Definition Clarity
  - [ ] E3.07 - Benefit-Feature Relationship
  - [ ] E3.08 - Topic Coverage Completeness
  - [ ] E3.09 - Semantic Relationship Density
  - [ ] E3.10 - Search/Question Intent Coverage
  - [ ] E3.11 - Terminology Consistency
  - [ ] E3.12 - Semantic Ambiguity

### Phase 4: Authority & Evidence Engine (E4) (Weeks 15-18)

**Goal**: Implement 12 mixed-type signals for E4

- [ ] Third-Party Source Crawling
  - [ ] Setup news/PR source monitoring
  - [ ] Setup review aggregation (G2, Capterra, etc.)
  - [ ] Setup social proof collection

- [ ] Signals (Mix of Types A, B, D)
  - [ ] E4.01 - First-Party Evidence Strength
  - [ ] E4.02 - Third-Party Evidence Volume
  - [ ] E4.03 - Third-Party Source Quality
  - [ ] E4.04 - Independent Brand Mentions
  - [ ] E4.05 - Expert/Professional References
  - [ ] E4.06 - Industry Publication Presence
  - [ ] E4.07 - Customer Evidence Strength
  - [ ] E4.08 - Review Evidence Strength
  - [ ] E4.09 - Case Study Evidence
  - [ ] E4.10 - Claim-Evidence Alignment
  - [ ] E4.11 - Cross-Source Factual Consistency
  - [ ] E4.12 - Information Freshness Across Sources

### Phase 5: Generative Perception Engine (E5) (Weeks 19-22)

**Goal**: Implement 14 Type C signals for E5 (HIGH COMMERCIAL VALUE)

- [ ] AI System Integration
  - [ ] OpenAI (ChatGPT) API setup
  - [ ] Anthropic (Claude) API setup
  - [ ] Google (Gemini) API setup
  - [ ] Perplexity API setup (if available)

- [ ] Query Infrastructure
  - [ ] Create query templates for brand testing
  - [ ] Implement concurrent query execution
  - [ ] Add result caching to reduce API costs
  - [ ] Implement rate limiting

- [ ] Type C Signals
  - [ ] E5.01 - AI Brand Mention Rate
  - [ ] E5.02 - AI Recommendation Rate
  - [ ] E5.03 - AI First-Mention Rate
  - [ ] E5.04 - AI Prominence Score
  - [ ] E5.05 - AI Brand Description Accuracy
  - [ ] E5.06 - AI Product Description Accuracy
  - [ ] E5.07 - AI Service Description Accuracy
  - [ ] E5.08 - AI Category Association
  - [ ] E5.09 - AI Use-Case Association
  - [ ] E5.10 - AI Audience Association
  - [ ] E5.11 - AI Benefit Association
  - [ ] E5.12 - AI Sentiment
  - [ ] E5.13 - AI Factual Accuracy
  - [ ] E5.14 - AI Brand Positioning Consistency

- [ ] Perception Dashboard
  - [ ] Create interactive chart showing brand perception
  - [ ] Create AI system comparison view
  - [ ] Create sentiment tracker

### Phase 6: Scoring & Reporting (Weeks 23-26)

- [ ] Overall Score Calculation
  - [ ] Implement weighted scoring per architecture
  - [ ] Implement trend calculation
  - [ ] Add score history tracking

- [ ] Report Generation
  - [ ] Create PDF report generator
  - [ ] Create HTML report template
  - [ ] Create executive summary
  - [ ] Add recommendations engine

### Phase 7: Competitive Intelligence (E6) (Weeks 27-30)

- [ ] Competitor Addition
  - [ ] API endpoint to add competitors
  - [ ] Competitor audit workflow

- [ ] Type C Signals
  - [ ] E6.01 - AI Share of Voice
  - [ ] E6.02 - Competitive Mention Rate
  - [ ] E6.03 - Competitive Recommendation Rate
  - [ ] E6.04 - Competitive First-Mention Rate
  - [ ] E6.05 - Competitive Prominence
  - [ ] E6.06 - Category Leadership Association
  - [ ] E6.07 - Brand Differentiation in AI
  - [ ] E6.08 - AI Preference Association
  - [ ] E6.09 - Competitor Citation Advantage
  - [ ] E6.10 - Competitor Evidence Advantage
  - [ ] E6.11 - Competitor Topic Association Advantage
  - [ ] E6.12 - AI Competitive Gap

- [ ] Competitive Dashboard
  - [ ] Create competitive benchmarking chart
  - [ ] Create share-of-voice breakdown
  - [ ] Create competitor positioning view

### Phase 8: Polish & Launch (Weeks 31+)

- [ ] Performance
  - [ ] Optimize database queries
  - [ ] Add caching layer for expensive computations
  - [ ] Profile signal computation times

- [ ] Security
  - [ ] Security audit
  - [ ] API rate limiting
  - [ ] Input validation hardening
  - [ ] Secrets management (use AWS Secrets Manager or Vault)

- [ ] Testing
  - [ ] Unit test all signal implementations
  - [ ] Integration tests for audit workflow
  - [ ] E2E tests for user flows
  - [ ] Load testing (simulate 100+ concurrent audits)

- [ ] Documentation
  - [ ] API documentation (OpenAPI/Swagger)
  - [ ] Signal documentation
  - [ ] Deployment guide
  - [ ] Configuration guide

- [ ] MVP Launch
  - [ ] Deploy to staging
  - [ ] Pilot with 2-3 customers
  - [ ] Gather feedback
  - [ ] Deploy to production

---

## 🗄️ Database Management

### Creating a Migration

```bash
# Create a new migration file
touch backend/migrations/002_add_audit_logs.sql

# Edit the file with your SQL changes

# Migrate (run in container or locally)
npm run db:migrate
```

### Resetting Database

```bash
# In container
docker-compose down -v postgres
docker-compose up postgres

# Locally (if using Docker)
docker volume rm ai-visibility_postgres_data
```

### Debugging Database

```bash
# Connect to postgres
docker exec -it ai-visibility-postgres psql -U aivisibility -d ai_visibility

# Useful queries
SELECT * FROM audits LIMIT 5;
SELECT COUNT(*) FROM signals;
SELECT engine_id, COUNT(*) FROM signals GROUP BY engine_id;
```

---

## 🧪 Testing

### Run Unit Tests

```bash
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Run Integration Tests

```bash
# Start test database
docker-compose up postgres -d

# Run integration tests
npm run test:integration

# Clean up
docker-compose down
```

---

## 📊 Monitoring & Debugging

### View Logs

```bash
# Backend logs
docker-compose logs -f backend

# Worker logs
docker-compose logs -f worker

# All services
docker-compose logs -f
```

### Database Inspection

```bash
# pgAdmin UI
open http://localhost:5050
# Email: admin@aivisibility.local
# Password: admin
```

### Redis Inspection

```bash
# Redis Commander UI
open http://localhost:8081

# Redis CLI
docker exec -it ai-visibility-redis redis-cli
> KEYS *
> GET key_name
```

### Performance Profiling

```bash
# Add timing logs in signal computation
console.time(`Signal ${signal.code}`);
// ... computation
console.timeEnd(`Signal ${signal.code}`);
```

---

## 🚨 Common Issues & Solutions

### "ECONNREFUSED" errors connecting to Postgres/Redis

```bash
# Check if services are running
docker-compose ps

# Restart services
docker-compose restart postgres redis

# Rebuild containers
docker-compose down
docker-compose up --build
```

### Type errors in TypeScript

```bash
# Rebuild types
npx tsc --noEmit

# Generate type definitions
npm run build
```

### API not responding

```bash
# Check backend health
curl http://localhost:4000/health

# View backend logs
docker-compose logs -f backend

# Check if port 4000 is in use
lsof -i :4000
```

### Job queue backlog

```bash
# Check job status
docker exec -it ai-visibility-redis redis-cli
> LLEN bull:audit:jobs
> LLEN bull:audit:active

# Clear stuck jobs (careful!)
> DEL bull:audit:jobs
```

---

## 📚 Next Steps

1. **Start with Phase 0**: Set up the project structure
2. **Build Phase 1**: Get E1 (Retrieval) signals working end-to-end
3. **Add E5 signals**: These have highest commercial value
4. **Expand to other engines**: E2, E3, E4, E6, E7

Remember: The architecture supports all 7 engines from day 1, so your early implementation decisions should not block future engines.

---

## 🤝 Contributing

- Follow TypeScript strict mode
- Add tests for new signals
- Document signal computation in `SIGNALS.md`
- Use type definitions from `signal-types.ts`

---

## 📞 Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Review the architecture: `ai-visibility-architecture.md`
3. Check signal examples: `sample-signal-implementations.ts`
4. Review API: `docs/API.md` (to be created)
