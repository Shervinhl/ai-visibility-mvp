# AI Visibility Platform - MVP

Experience Intelligence for AI Discovery, Understanding, Trust, and Recommendation.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15 (or via Docker)
- Redis 7 (or via Docker)

### 1. Setup Environment

```bash
# Clone/extract the project
cd ai-visibility-mvp

# Copy environment template
cp .env.example .env

# Install dependencies
cd backend
npm install
```

### 2. Start Database Services

```bash
# Using Docker Compose (recommended)
docker-compose up postgres redis

# Or start just Postgres and Redis without other services
```

### 3. Initialize Database

```bash
cd backend

# Run migrations
npm run db:migrate
```

### 4. Start Backend Server

```bash
# Development mode
npm run dev

# Server will start on http://localhost:4000
```

### 5. Test the API

```bash
# Create an audit
curl -X POST http://localhost:4000/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Example Company",
    "domain": "example.com",
    "websiteUrl": "https://example.com"
  }'

# Get audit status (replace ID with returned audit ID)
curl http://localhost:4000/api/v1/audits/{audit-id}

# Get all signals
curl http://localhost:4000/api/v1/audits/{audit-id}/signals

# Get specific signal
curl http://localhost:4000/api/v1/audits/{audit-id}/signals/E1.01
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration (database, Redis)
│   ├── api/             # API routes
│   ├── core/            # Signal computation engines
│   │   └── signals/     # Individual signal implementations
│   ├── integrations/    # External integrations (web crawlers, AI APIs)
│   ├── models/          # Database models
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utilities (logger, etc.)
│   └── index.ts         # Server entry point
├── migrations/          # Database migrations
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript configuration
└── Dockerfile           # Docker configuration
```

## 📊 Current MVP Status

### ✅ Implemented (Phase 1)

- [x] Database schema (organizations, audits, signals, scores)
- [x] Express API server
- [x] Web crawler (Playwright)
- [x] E1 (Retrieval) Engine signals:
  - [x] E1.01 - AI Crawl Accessibility
  - [x] E1.08 - Machine-Readable Content Ratio
  - [x] E1.09 - Structured Data Coverage
  - [x] E1.11 - Canonical Consistency
  - [x] E1.12 - Content Freshness
- [x] Audit orchestration
- [x] Signal computation infrastructure
- [x] API endpoints for audits and signals

### 🔄 In Progress

- [ ] Remaining E1 signals (E1.02-E1.07, E1.10)
- [ ] E2 (Entity Intelligence) engine
- [ ] Score calculation and aggregation
- [ ] Frontend React application

### ⏳ Coming Soon

- [ ] E3-E7 engines
- [ ] AI system integrations (Claude, ChatGPT, Gemini)
- [ ] Competitive analysis
- [ ] Report generation
- [ ] Advanced UI dashboard

## 🔑 API Endpoints

### Create Audit
```
POST /api/v1/audits
{
  "organizationName": "Company Name",
  "domain": "company.com",
  "websiteUrl": "https://company.com"
}
```

### Get Audit
```
GET /api/v1/audits/{id}
```

### Get All Signals
```
GET /api/v1/audits/{id}/signals
```

### Get Specific Signal
```
GET /api/v1/audits/{id}/signals/{code}
```

### Get Signals by Engine
```
GET /api/v1/audits/{id}/signals?engine=E1
```

### Get Signals by Type
```
GET /api/v1/audits/{id}/signals?type=A
```

## 🛠️ Development

### Running Tests

```bash
npm test
npm run test:watch
```

### Database Operations

```bash
# Run migrations
npm run db:migrate

# Seed test data
npm run db:seed

# Connect to database
psql -h localhost -U aivisibility -d ai_visibility
```

### Linting & Formatting

```bash
npm run lint
npm run format
```

## 📝 Adding a New Signal

### 1. Create Signal Class

```typescript
// backend/src/core/signals/typeA/my-signal.ts
import { TypeASignal } from './base';

export class E1_XX_MySignal extends TypeASignal {
  code = 'E1.XX';
  name = 'Signal Name';
  description = 'What this measures';

  async compute(auditData: AuditData): Promise<number> {
    // Implement signal computation
    return 75; // Return 0-100 score
  }
}
```

### 2. Add to Signal List

```typescript
// backend/src/core/signals/typeA/e1-signals.ts
export const E1_TYPE_A_SIGNALS = [
  // ... existing signals
  new E1_XX_MySignal(),
];
```

### 3. Update Audit Orchestrator

```typescript
// backend/src/core/audit-orchestrator.ts
// Add signal computation in runSignalComputation()
```

## 🐛 Troubleshooting

### "Cannot connect to database"

```bash
# Check if Postgres is running
docker-compose ps

# Restart services
docker-compose restart postgres
```

### "Cannot connect to Redis"

```bash
# Check if Redis is running
docker-compose logs redis

# Restart Redis
docker-compose restart redis
```

### Build errors

```bash
# Clear and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Port already in use

```bash
# Find process on port 4000
lsof -i :4000

# Kill process
kill -9 <PID>
```

## 📊 Database Schema

### organizations
- id (UUID)
- name, domain, description
- industry, founded_year, website_url
- entity_type, entity_names, locations
- created_at, updated_at

### audits
- id (UUID)
- organization_id (FK)
- audit_type, status
- engines_to_run, signal_types (JSONB)
- started_at, completed_at, duration_seconds
- created_at, updated_at

### signals
- id (UUID)
- audit_id (FK)
- engine_id, signal_code, signal_type
- name, description
- raw_value, normalized_score, confidence
- evidence, computation_details (JSONB)
- created_at, updated_at

### engine_scores
- id (UUID)
- audit_id (FK), engine_id
- score, signal_count
- type_a_count, type_b_count, type_c_count, type_d_count
- created_at, updated_at

### ai_visibility_scores
- id (UUID)
- audit_id (FK, UNIQUE)
- overall_score
- retrieval_score, entity_score, semantic_score, etc.
- created_at

## 🚢 Deployment

### Docker Build

```bash
# Build backend image
docker build -t ai-visibility-backend:latest backend/

# Run container
docker run -p 4000:4000 \
  -e DB_HOST=postgres \
  -e REDIS_URL=redis://redis:6379 \
  ai-visibility-backend:latest
```

### Full Stack with Docker Compose

```bash
# Start all services
docker-compose up

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down
```

## 📚 Documentation

- [Architecture](../ai-visibility-architecture.md) - System design and tech stack
- [Quick Start](../QUICK_START.md) - Development guide and checklist
- [Signal Framework](./signals.md) - How signals work (coming soon)
- [API Reference](./api.md) - Complete API documentation (coming soon)

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit changes: `git commit -am 'Add my feature'`
3. Push to branch: `git push origin feature/my-feature`
4. Create a Pull Request

## 📞 Support

For issues or questions, refer to:
1. Check logs: `npm run dev 2>&1 | tee logs/server.log`
2. Review architecture docs
3. Check existing GitHub issues
4. Create a new issue with details

## 📄 License

Proprietary - Besignitics

---

**Built with** ❤️ **for AI-driven insight**
