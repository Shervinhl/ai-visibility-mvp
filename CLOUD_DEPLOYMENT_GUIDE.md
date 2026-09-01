# AI Visibility MVP - Cloud Deployment Guide

Deploy your AI Visibility backend to the cloud in minutes!

---

## 🌐 Popular Cloud Platforms

Choose one based on your needs:

| Platform | Setup Time | Cost | Best For |
|----------|-----------|------|----------|
| **Heroku** | 5 min | $7-50/mo | Fastest deployment |
| **Railway** | 5 min | $5-50/mo | Easy + affordable |
| **Render** | 10 min | $7-50/mo | Good free tier |
| **AWS** | 20 min | $15-100/mo | Most control |
| **Google Cloud** | 20 min | $15-100/mo | Google ecosystem |
| **Azure** | 20 min | $15-100/mo | Microsoft ecosystem |
| **DigitalOcean** | 15 min | $5-40/mo | VPS approach |

---

## 🚀 OPTION 1: Heroku (Fastest - Recommended for MVP)

**Setup Time: 5 minutes**

### Step 1: Sign Up
1. Go to https://www.heroku.com
2. Click "Sign up for free"
3. Create account and verify email

### Step 2: Install Heroku CLI
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows
# Download from https://devcenter.heroku.com/articles/heroku-cli

# Linux
curl https://cli-assets.heroku.com/install.sh | sh
```

### Step 3: Login to Heroku
```bash
heroku login
```

### Step 4: Prepare Your App
```bash
cd ai-visibility-mvp

# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit"

# Create Heroku app
heroku create your-app-name

# Replace 'your-app-name' with something unique like 'ai-visibility-xyz'
```

### Step 5: Add PostgreSQL Database
```bash
# Add PostgreSQL add-on (free tier available)
heroku addons:create heroku-postgresql:hobby-dev -a your-app-name

# This automatically sets DATABASE_URL environment variable
```

### Step 6: Add Redis Cache
```bash
# Add Redis (paid: ~$15/mo)
heroku addons:create heroku-redis:premium-0 -a your-app-name

# Or use free alternative (cloud memcache)
```

### Step 7: Set Environment Variables
```bash
heroku config:set JWT_SECRET="your-secret-key" -a your-app-name
heroku config:set NODE_ENV="production" -a your-app-name
heroku config:set API_PORT="5000" -a your-app-name

# For AI services (optional)
heroku config:set ANTHROPIC_API_KEY="your-key" -a your-app-name
heroku config:set OPENAI_API_KEY="your-key" -a your-app-name
```

### Step 8: Create Procfile
```bash
# In project root, create Procfile:
echo "web: cd backend && npm start" > Procfile
```

### Step 9: Deploy
```bash
git add Procfile
git commit -m "Add Procfile"
git push heroku main
```

### Step 10: Run Database Migrations
```bash
heroku run "cd backend && npm run db:migrate" -a your-app-name
```

### Step 11: Test
```bash
# Get app URL
heroku apps:info -a your-app-name

# Test health endpoint
curl https://your-app-name.herokuapp.com/health

# Create audit
curl -X POST https://your-app-name.herokuapp.com/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{"organizationName":"Test","domain":"example.com","websiteUrl":"https://example.com"}'
```

### View Logs
```bash
heroku logs --tail -a your-app-name
```

### Cost
- Web dyno: $7/month (basic)
- PostgreSQL: Free (hobby tier) → $50/month (production)
- Redis: $15/month minimum
- **Total: $22-72/month**

---

## 🚀 OPTION 2: Railway (Easy + Affordable)

**Setup Time: 5 minutes**

### Step 1: Sign Up
1. Go to https://railway.app
2. Sign up with GitHub
3. Connect your GitHub account

### Step 2: Create Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect to your GitHub account
4. Select `ai-visibility-mvp` repository

### Step 3: Add PostgreSQL
1. In Railway dashboard, click "Add service"
2. Search and add "PostgreSQL"
3. It will create a database automatically

### Step 4: Add Redis (Optional)
1. Click "Add service"
2. Search and add "Redis"
3. Configure as needed

### Step 5: Configure Environment
1. In Railway dashboard, go to Variables
2. Add:
   ```
   NODE_ENV=production
   JWT_SECRET=your-secret-key
   ANTHROPIC_API_KEY=your-key
   ```

### Step 6: Configure Root Directory
1. In Settings, set "Root Directory" to `backend`

### Step 7: Set Build Command
1. In Settings, set "Build Command" to `npm install`

### Step 8: Set Start Command
1. In Settings, set "Start Command" to `npm start`

### Step 9: Deploy
1. Railway will automatically deploy from GitHub
2. It will run on `your-project-xyz.up.railway.app`

### View Logs
```bash
# In Railway dashboard, click on your app → Logs
```

### Cost
- Starter plan: $5/month (after free tier)
- Database: Included
- **Total: ~$20-50/month**

---

## 🚀 OPTION 3: Render (Good Free Tier)

**Setup Time: 10 minutes**

### Step 1: Sign Up
1. Go to https://render.com
2. Sign up with GitHub
3. Connect your GitHub

### Step 2: Create Web Service
1. Click "New +"
2. Select "Web Service"
3. Connect your repository
4. Select `ai-visibility-mvp`

### Step 3: Configure Service
- **Name**: ai-visibility-backend
- **Runtime**: Node
- **Root Directory**: backend
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### Step 4: Add PostgreSQL Database
1. Click "New +"
2. Select "PostgreSQL"
3. Configure database name
4. Save (note the internal database URL)

### Step 5: Connect Database to Web Service
1. Go to Web Service → Environment
2. Add variable `DATABASE_URL` with PostgreSQL connection string

### Step 6: Add Environment Variables
```
NODE_ENV=production
JWT_SECRET=your-secret
API_PORT=10000
REDIS_URL=redis://... (if using external Redis)
```

### Step 7: Deploy
1. Service will build and deploy automatically
2. Access at `https://ai-visibility-backend.onrender.com`

### Cost
- Free tier: 0.5 GB RAM (limited uptime)
- Paid starter: $7/month
- PostgreSQL: $15/month
- **Total: ~$22-50/month**

---

## 🚀 OPTION 4: AWS (Most Control)

**Setup Time: 20 minutes**

### Step 1: Create AWS Account
1. Go to https://aws.amazon.com
2. Create account
3. Set up billing

### Step 2: Create RDS PostgreSQL Database
1. Go to RDS Dashboard
2. Click "Create database"
3. Select PostgreSQL
4. Choose free tier if eligible
5. Configure:
   - DB name: `ai_visibility`
   - Username: `aivisibility`
   - Password: (strong password)
6. Note the endpoint URL

### Step 3: Create ElastiCache Redis (Optional)
1. Go to ElastiCache
2. Create Redis cluster
3. Note the endpoint

### Step 4: Create EC2 Instance (or use App Runner)

**Option A: EC2 (More control)**
1. Launch EC2 instance
2. Choose Ubuntu 22.04
3. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Clone repository:
   ```bash
   git clone your-repo-url
   cd ai-visibility-mvp/backend
   npm install
   ```
5. Set environment variables:
   ```bash
   export DATABASE_URL="postgres://user:pass@rds-endpoint/ai_visibility"
   export REDIS_URL="redis://redis-endpoint:6379"
   ```
6. Start with PM2:
   ```bash
   npm install -g pm2
   pm2 start "npm start" --name "ai-visibility"
   pm2 save
   ```

**Option B: App Runner (Easier)**
1. Go to App Runner
2. Create service
3. Connect GitHub repository
4. Set environment variables
5. Deploy

### Step 5: Set Up Load Balancer (Optional)
1. Use AWS ALB for load balancing
2. Route traffic to your EC2 instances

### Cost
- EC2: $3-20/month
- RDS PostgreSQL: $15-100/month
- ElastiCache: $15-50/month
- **Total: $33-170/month**

---

## 🚀 OPTION 5: Google Cloud (GCP)

**Setup Time: 20 minutes**

### Step 1: Create GCP Account
1. Go to https://cloud.google.com
2. Create account with free $300 credit
3. Create a project

### Step 2: Enable APIs
1. Go to APIs & Services
2. Enable:
   - Cloud Run API
   - Cloud SQL Admin API
   - Compute Engine API

### Step 3: Create Cloud SQL PostgreSQL
1. Go to Cloud SQL
2. Click "Create instance"
3. Choose PostgreSQL
4. Configure:
   - Instance ID: `ai-visibility-db`
   - Password: (strong)
   - Region: (closest to users)
5. Note the connection string

### Step 4: Deploy to Cloud Run
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
gcloud init

# Configure
gcloud config set project YOUR_PROJECT_ID

# Create Dockerfile in backend/
# (already provided in ai-visibility-mvp)

# Deploy
gcloud run deploy ai-visibility \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="your-connection-string"
```

### Step 5: Set Environment Variables
```bash
gcloud run services update ai-visibility \
  --update-env-vars REDIS_URL="redis://..." \
  --region us-central1
```

### Cost
- Cloud Run: $0.40 per 1M requests
- Cloud SQL: $15-100/month
- Free tier: 2M requests/month
- **Total: $15-100/month**

---

## 🚀 OPTION 6: DigitalOcean (VPS Approach)

**Setup Time: 15 minutes**

### Step 1: Create DigitalOcean Account
1. Go to https://digitalocean.com
2. Sign up
3. Add payment method

### Step 2: Create Droplet
1. Click "Create" → "Droplets"
2. Choose:
   - Image: Ubuntu 22.04
   - Size: Basic ($5/month)
   - Region: (closest to users)
3. Add SSH key
4. Create droplet

### Step 3: SSH into Droplet
```bash
ssh root@your_droplet_ip
```

### Step 4: Install Dependencies
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install Redis
apt install -y redis-server

# Install PM2 (process manager)
npm install -g pm2
```

### Step 5: Clone and Deploy App
```bash
cd /app
git clone your-repo-url
cd ai-visibility-mvp/backend
npm install
```

### Step 6: Configure Database
```bash
# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE ai_visibility;
CREATE USER aivisibility WITH PASSWORD 'password';
ALTER ROLE aivisibility SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE ai_visibility TO aivisibility;
\q

# Run migrations
npm run db:migrate
```

### Step 7: Start Application
```bash
pm2 start "npm start" --name "ai-visibility"
pm2 save
pm2 startup
```

### Step 8: Set Up Domain (Optional)
```bash
# Point domain to droplet IP
# Install nginx as reverse proxy
apt install -y nginx

# Configure nginx to proxy to Node.js
```

### Cost
- Droplet: $5/month
- Database: Included
- **Total: $5-20/month**

---

## 📊 Deployment Comparison

| Feature | Heroku | Railway | Render | AWS | GCP | DigitalOcean |
|---------|--------|---------|--------|-----|-----|--------------|
| Setup Time | 5 min | 5 min | 10 min | 20 min | 20 min | 15 min |
| Min Cost | $22/mo | $20/mo | $22/mo | $33/mo | $15/mo | $5/mo |
| Free Tier | Limited | Yes | Yes | Yes | $300 credit | No |
| Scaling | Easy | Easy | Easy | Complex | Easy | Manual |
| Learning Curve | Very Easy | Easy | Easy | Hard | Medium | Medium |
| Best For | MVP | MVP | MVP | Production | Production | Learning |

---

## 🔧 Environment Variables for Production

Regardless of platform, set these variables:

```
NODE_ENV=production
API_PORT=5000 (or required by platform)
DB_HOST=your-database-host
DB_PORT=5432
DB_USER=aivisibility
DB_PASSWORD=strong-password
DB_NAME=ai_visibility
REDIS_URL=redis://your-redis-url
JWT_SECRET=very-strong-secret-key
LOG_LEVEL=info
ANTHROPIC_API_KEY=your-key (optional)
OPENAI_API_KEY=your-key (optional)
MAX_PAGES_PER_AUDIT=500
CRAWL_TIMEOUT_MS=30000
```

---

## 🔒 Security Checklist

Before deploying:

- [ ] Use strong database password
- [ ] Set JWT_SECRET to random string (use `openssl rand -hex 32`)
- [ ] Use HTTPS only
- [ ] Enable SSL on database
- [ ] Restrict IP access if possible
- [ ] Use environment variables for secrets
- [ ] Enable database backups
- [ ] Set up monitoring and alerts
- [ ] Enable audit logging
- [ ] Regularly update dependencies

---

## 📈 Scaling Considerations

### When You Have 100+ Audits/Day
- Increase server RAM (upgrade droplet/dyno)
- Enable Redis caching
- Use database connection pooling
- Add CDN for static files

### When You Have 1000+ Audits/Day
- Use load balancer
- Multiple app instances
- Database read replicas
- Advanced caching strategy

### When You Have 10000+ Audits/Day
- Kubernetes (GKE/EKS)
- Advanced database sharding
- Dedicated Redis cluster
- Message queue for jobs

---

## 🚀 My Recommendation for MVP

**Use Railway or Render:**
- ✅ Easiest setup (5 minutes)
- ✅ Affordable ($20-30/month)
- ✅ GitHub integration for auto-deploy
- ✅ Built-in PostgreSQL
- ✅ Simple scaling
- ✅ Free tier available

**Steps:**
1. Push code to GitHub
2. Sign up for Railway/Render
3. Connect GitHub repo
4. Add database
5. Set environment variables
6. Deploy (automatic)

Done! Your app is live.

---

## 🔗 Useful Links

- **Heroku**: https://www.heroku.com
- **Railway**: https://railway.app
- **Render**: https://render.com
- **AWS**: https://aws.amazon.com
- **Google Cloud**: https://cloud.google.com
- **DigitalOcean**: https://digitalocean.com
- **Azure**: https://azure.microsoft.com

---

## 📞 Common Issues

### "Cannot connect to database"
- Check DATABASE_URL environment variable
- Verify database is running
- Check firewall rules
- Verify credentials

### "Application timeout"
- Increase timeout limits
- Check crawler settings
- Optimize database queries
- Add more server resources

### "Out of memory"
- Reduce MAX_PAGES_PER_AUDIT
- Increase server RAM
- Enable database connection pooling
- Use Redis caching

---

## 🎯 Next Steps

1. **Choose a platform** (Railway recommended for MVP)
2. **Follow the deployment guide** for your chosen platform
3. **Test the deployed API** with curl commands
4. **Monitor logs** and performance
5. **Set up automatic backups**
6. **Enable monitoring/alerts**
7. **Keep deploying improvements!**

---

## 💡 Pro Tips

### Auto-Deploy on Git Push
Most platforms support automatic deployment when you push to main branch:
```bash
git push origin main
# Platform automatically builds and deploys
```

### Database Backups
Enable automatic backups in your platform:
- Heroku: Built-in
- Railway: Built-in
- AWS: Manual or automated
- GCP: Manual or automated

### Monitoring
Set up monitoring for:
- Response times
- Error rates
- Database performance
- Memory usage
- Uptime alerts

### Custom Domain
Point your domain to your deployed app:
1. Get platform URL
2. Add CNAME record in DNS
3. Enable SSL certificate
4. Update API calls to use custom domain

---

**Ready to go live?** Pick a platform and follow the guide! 🚀
