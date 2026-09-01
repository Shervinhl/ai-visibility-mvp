# MVP Setup & First Run Guide

This guide walks through setting up and running the AI Visibility MVP from scratch.

## ✅ Prerequisites Check

Ensure you have installed:

```bash
# Node.js 20+
node --version
# Should output v20.x.x or higher

# npm 10+
npm --version
# Should output 10.x.x or higher

# Docker & Docker Compose
docker --version
# Should output Docker version 24+ or higher

docker-compose --version
# Should output version 2.x.x or higher
```

If you don't have these, install them first:
- **Node.js**: https://nodejs.org (install v20 LTS)
- **Docker**: https://www.docker.com/products/docker-desktop

## 🚀 Step 1: Clone & Setup Project

```bash
# Navigate to where you want the project
cd ~/projects

# Extract or clone the project (replace with your method)
# If you have the files, extract them here
cd ai-visibility-mvp

# Copy environment file
cp .env.example .env

# Create logs directory
mkdir -p logs
```

## 📦 Step 2: Install Backend Dependencies

```bash
cd backend

# Install npm dependencies
npm install

# This will take 2-3 minutes and install ~150 packages
```

## 🐳 Step 3: Start Database Services

```bash
# From the project root
cd ..

# Start PostgreSQL and Redis containers
docker-compose up postgres redis -d

# Verify they're running
docker-compose ps
# Should show postgres and redis as "running"

# Wait for them to be healthy (10-15 seconds)
sleep 15
```

## 📊 Step 4: Initialize Database

```bash
cd backend

# Run database migrations
npm run db:migrate

# This creates all tables and schema
```

## ✅ Step 5: Verify Database Connection

```bash
# Test database connection directly
npm run dev 2>&1 | head -30

# You should see:
# "Database connection successful"
# "Redis connection established"
```

## 🚀 Step 6: Start Backend Server

```bash
# Keep in backend directory
npm run dev

# Server will start and you should see:
# "Server listening on http://0.0.0.0:4000"
# "AI Visibility Backend Ready"
```

**Leave this running in one terminal window**

## 🧪 Step 7: Test the API (New Terminal)

```bash
# Open a new terminal window in the project root

# Test health endpoint
curl http://localhost:4000/health

# Should return:
# {"status":"ok","timestamp":"2024-...","uptime":...}
```

## 📝 Step 8: Create Your First Audit

```bash
# Create an audit for example.com
curl -X POST http://localhost:4000/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Example Company",
    "domain": "example.com",
    "websiteUrl": "https://example.com",
    "auditType": "full"
  }'

# Response will look like:
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "organizationId": "...",
#   "organizationName": "Example Company",
#   "status": "queued",
#   "createdAt": "2024-..."
# }

# Copy the audit ID for next step
```

## 📊 Step 9: Monitor Audit Progress

```bash
# Replace {audit-id} with the ID from previous step
# Watch for status changes from "queued" → "running" → "completed"

curl http://localhost:4000/api/v1/audits/{audit-id}

# After 10-30 seconds (depending on site size), status should be "completed"
```

## 📈 Step 10: View Audit Results

```bash
# Get complete audit results
curl http://localhost:4000/api/v1/audits/{audit-id} | jq .

# Get all signals
curl http://localhost:4000/api/v1/audits/{audit-id}/signals | jq .

# Get specific signal
curl http://localhost:4000/api/v1/audits/{audit-id}/signals/E1.01 | jq .
```

## 🛠️ Useful Commands

### View Database

```bash
# Connect to database shell
docker exec -it ai-visibility-postgres psql -U aivisibility -d ai_visibility

# Inside psql, try:
# \dt              # List all tables
# SELECT * FROM organizations LIMIT 5;
# SELECT * FROM audits LIMIT 5;
# SELECT count(*) FROM signals;

# Exit with \q
```

### View Redis

```bash
# Open Redis Commander UI
open http://localhost:8081

# Or use Redis CLI
docker exec -it ai-visibility-redis redis-cli
# KEYS *
# GET key_name
```

### View Logs

```bash
# From project root
tail -f logs/all.log

# Or from backend
cd backend
npm run dev 2>&1 | tee ../logs/output.log
```

### Access pgAdmin

```bash
# Open pgAdmin UI
open http://localhost:5050

# Login:
# Email: admin@example.com
# Password: admin

# Add PostgreSQL server:
# Host: postgres
# Port: 5432
# Database: ai_visibility
# Username: aivisibility
# Password: devpassword
```

## 🧹 Cleanup & Reset

```bash
# Stop backend (Ctrl+C in terminal where it's running)

# Stop all Docker services
docker-compose down

# Remove database (careful!)
docker-compose down -v

# Clean build files
make clean

# Reinstall from scratch
make clean-all
make install
```

## ❌ Troubleshooting

### "Address already in use"

```bash
# Port 4000 is in use
lsof -i :4000
kill -9 <PID>

# Or use different port
API_PORT=5000 npm run dev
```

### "Cannot connect to database"

```bash
# Check if postgres container is running
docker-compose ps

# View postgres logs
docker-compose logs postgres

# Restart postgres
docker-compose restart postgres
sleep 10
```

### "Cannot find module"

```bash
# Reinstall dependencies
cd backend
rm -rf node_modules
npm install
```

### "TypeScript compilation error"

```bash
# Try rebuilding
npm run build

# Or clean and reinstall
rm -rf dist node_modules
npm install
npm run dev
```

### "Audit status stuck on 'running'"

```bash
# Check backend logs for errors
# If timeout, increase CRAWL_TIMEOUT_MS in .env
CRAWL_TIMEOUT_MS=60000 npm run dev
```

## 📚 Next Steps

After successful setup:

1. **Explore the codebase**
   - Check `backend/src/core/signals/typeA/e1-signals.ts` to see signal implementations
   - Review `backend/src/core/audit-orchestrator.ts` for audit workflow
   - Look at `backend/src/integrations/web/crawler.ts` for web crawling logic

2. **Run more audits**
   - Try with different domains
   - Monitor how signals score different sites
   - Check evidence data for insights

3. **Implement more signals**
   - Look at `QUICK_START.md` for signal implementation guide
   - Add E1.02-E1.07, E1.10 signals
   - Then move to E2 (Entity Intelligence) engine

4. **Start frontend**
   - Create React app for visualizing audits
   - Build dashboard to display signals and scores
   - Add audit creation form

## 📊 What's Working Now

✅ Web crawling (Playwright)
✅ Page discovery and analysis
✅ Structured data extraction
✅ 5 Type A signals (E1.01, E1.08, E1.09, E1.11, E1.12)
✅ Database persistence
✅ API endpoints
✅ Audit orchestration

## 🔄 What's Next

- [ ] Complete E1 engine (remaining 7 signals)
- [ ] E2 engine (Entity Intelligence)
- [ ] Score calculation and aggregation
- [ ] Frontend dashboard
- [ ] E3-E7 engines
- [ ] AI system integrations
- [ ] Report generation

---

**Congrats! You now have a working AI Visibility MVP! 🎉**

Need help? Check:
- `README.md` - Project overview
- `../QUICK_START.md` - Development guide
- Backend logs - `logs/all.log`
- Docker logs - `docker-compose logs -f`
