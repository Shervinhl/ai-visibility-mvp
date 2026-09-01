# 🚀 AI Visibility MVP - Run Locally OR Online

You can run your MVP in two ways:

---

## 🏠 **OPTION 1: Run Locally** (Your Computer)

**Time:** 5 minutes
**Cost:** $0 (free)
**Best for:** Development & testing

### Quick Start
```bash
cd ai-visibility-mvp
cp .env.example .env
cd backend && npm install
cd .. && docker-compose up postgres redis -d
cd backend && npm run db:migrate
npm run dev
```

Your API: `http://localhost:4000`

**More info:** See `ai-visibility-mvp/SETUP.md`

---

## 🌍 **OPTION 2: Run Online** (Cloud - RECOMMENDED FOR MVP)

**Time:** 10 minutes
**Cost:** $5-50/month
**Best for:** Live testing, sharing, production

### Fastest Option: Railway (⭐ RECOMMENDED)

**5 Simple Steps:**

1. **Push to GitHub**
   ```bash
   git init && git add . && git commit -m "MVP"
   git push origin main
   ```

2. **Sign up at Railway.app**
   https://railway.app

3. **Connect your GitHub repo**
   Click "New Project" → "Deploy from GitHub"

4. **Add PostgreSQL**
   Click "Add Service" → "PostgreSQL"

5. **Done! 🎉**
   Your API is live at: `https://your-project-xxx.up.railway.app`

**Detailed guide:** See `RAILWAY_DEPLOYMENT.md`

### Other Cloud Options

- **Render.app** (10 min) - Good free tier
- **Heroku** (10 min) - Established platform
- **AWS** (20 min) - Most control, paid only
- **Google Cloud** (20 min) - Free credits
- **DigitalOcean** (15 min) - VPS approach

**Detailed guide:** See `CLOUD_DEPLOYMENT_GUIDE.md`

---

## 📊 Comparison

| Feature | Local | Railway | Render | Heroku | AWS |
|---------|-------|---------|--------|--------|-----|
| Setup Time | 5 min | 5 min | 10 min | 10 min | 20 min |
| Cost | $0 | $5-30/mo | $7-30/mo | $22-72/mo | $33-170/mo |
| Accessible from internet | No | Yes ✅ | Yes ✅ | Yes ✅ | Yes ✅ |
| Auto-deploy on git push | No | Yes ✅ | Yes ✅ | Yes ✅ | No |
| Easy database | Yes | Yes ✅ | Yes ✅ | Yes ✅ | Complex |
| Good for MVP | Yes | Yes ✅✅ | Yes ✅ | Yes ✅ | Not really |

---

## 🎯 How to Choose

### Choose **LOCAL** if:
- You're developing and testing
- You want zero cost
- You don't need external access
- You have Docker installed

→ Follow: `ai-visibility-mvp/SETUP.md`

### Choose **RAILWAY** if: (⭐ RECOMMENDED)
- You want to go live quickly
- You want cheap hosting ($5-30/mo)
- You want auto-deploy on git push
- This is an MVP

→ Follow: `RAILWAY_DEPLOYMENT.md`

### Choose **RENDER** if:
- You want free tier available
- You prefer Render's interface
- Similar to Railway but different UI

→ Follow: `CLOUD_DEPLOYMENT_GUIDE.md` (Option 3)

### Choose **OTHER PLATFORMS** if:
- You have specific requirements
- You already use that cloud provider
- You need particular integrations

→ Follow: `CLOUD_DEPLOYMENT_GUIDE.md` (Options 1, 4, 5, 6)

---

## 🚀 My Recommendation for You

**Start with Railway:**

1. **It's the fastest** - 5 minutes
2. **It's the cheapest** - $5-30/month
3. **It's the easiest** - Auto-deploy from GitHub
4. **It's perfect for MVP** - Exactly what you need

**Steps to go live:**

```bash
# 1. Push to GitHub (2 min)
cd ai-visibility-mvp
git init && git add . && git commit -m "MVP"
git remote add origin https://github.com/YOUR/REPO
git push -u origin main

# 2. Sign up on Railway (1 min)
# Go to https://railway.app → Sign up with GitHub

# 3. Deploy (2 min)
# In Railway: New Project → Deploy from GitHub → Select repo

# 4. Add database (2 min)
# In Railway: Add Service → PostgreSQL

# 5. Set variables (2 min)
# In Railway: Variables → Add NODE_ENV=production

# Done! Your API is live! 🎉
```

**Your live URL:** `https://your-project-xxx.up.railway.app`

---

## 💡 What You Get

### With Local Setup
✅ Develop on your machine
✅ Test signals and API
✅ No cost
✅ Full control
❌ Not accessible from internet
❌ Must keep computer running

### With Cloud Setup (Railway)
✅ Live on internet 24/7
✅ Share URL with others
✅ Auto-deploy code changes
✅ Professional hosting
✅ Easy to scale
✅ Automatic backups
💰 $5-30/month cost

---

## 🔗 API Access

### Local
```bash
curl http://localhost:4000/api/v1/audits
```

### Railway
```bash
curl https://your-project-xxx.up.railway.app/api/v1/audits
```

Same API, different URL!

---

## 📱 Example: Create First Audit

### Local
```bash
curl -X POST http://localhost:4000/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{"organizationName":"Test","domain":"example.com","websiteUrl":"https://example.com"}'
```

### Railway (Online)
```bash
curl -X POST https://your-project-xxx.up.railway.app/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{"organizationName":"Test","domain":"example.com","websiteUrl":"https://example.com"}'
```

---

## 📚 Documentation Files

**For Local Setup:**
- `ai-visibility-mvp/SETUP.md` - Step-by-step local setup
- `README.md` - Project overview
- `QUICK_START.md` - Development guide

**For Cloud Deployment:**
- `CLOUD_QUICK_START.md` - ⭐ Quick overview
- `RAILWAY_DEPLOYMENT.md` - ⭐ Railway detailed guide (RECOMMENDED)
- `CLOUD_DEPLOYMENT_GUIDE.md` - All platforms in detail

**General:**
- `START_HERE.md` - Getting started guide
- `MVP_IMPLEMENTATION_GUIDE.md` - Complete implementation
- `ai-visibility-architecture.md` - System design

---

## 🎯 Next Steps

### If You Want to Go Local:
1. Read: `ai-visibility-mvp/SETUP.md`
2. Follow the 5-step quick start
3. Run `npm run dev`

### If You Want to Go Online (RECOMMENDED):
1. Read: `RAILWAY_DEPLOYMENT.md`
2. Push code to GitHub
3. Deploy on Railway
4. Done!

### If You Want Both:
1. Develop locally
2. Deploy online
3. Use Railway auto-deploy to keep online version updated

---

## 💰 Cost Comparison

**Local:**
- Docker images: Free
- PostgreSQL: Free
- Redis: Free
- Your electricity: ~$1-2/month
- **Total: ~$2/month**

**Railway:**
- Included in Railway subscription
- PostgreSQL: Included
- Redis: $15/month (optional)
- **Total: $5-30/month**

**Heroku:**
- Web dyno: $7/month
- PostgreSQL: $50/month (production)
- **Total: $57/month minimum**

Railway is the best value for MVP!

---

## 🎓 Learning Path

### Week 1: Build & Test
1. Deploy locally or on Railway
2. Run sample audits
3. Explore the code
4. Test the API

### Week 2: Customize
1. Add more signals
2. Implement E2 engine
3. Add score calculation
4. Test new features

### Week 3: Scale
1. Add frontend
2. Improve performance
3. Add monitoring
4. Plan production

---

## ✅ Quick Checklist

**For Local:**
- [ ] Node.js 20+ installed
- [ ] Docker installed
- [ ] 5 GB free space
- [ ] Run setup commands
- [ ] Access `localhost:4000`

**For Railway:**
- [ ] GitHub account
- [ ] Railway account
- [ ] Code pushed to GitHub
- [ ] Railway deployment connected
- [ ] PostgreSQL added
- [ ] Access `your-url.up.railway.app`

---

## 🆘 Quick Troubleshooting

### Local Issues
- **Cannot connect to DB**: Check Docker is running
- **Port 4000 in use**: `lsof -i :4000` then kill process
- **Build fails**: `rm -rf node_modules && npm install`

### Railway Issues
- **Build fails**: Check logs in Railway dashboard
- **Cannot connect to DB**: Wait 30 seconds for database to start
- **Slow response**: Upgrade Railway plan

---

## 🎉 You're Ready!

Choose your path:

1. **Local Development** → `ai-visibility-mvp/SETUP.md`
2. **Railway Online** → `RAILWAY_DEPLOYMENT.md`
3. **Other Platforms** → `CLOUD_DEPLOYMENT_GUIDE.md`

---

## 🚀 Start Now!

**Local:** 
```bash
cd ai-visibility-mvp && ./setup.sh
```

**Online:**
Go to https://railway.app and deploy in 5 minutes!

---

That's it! You now know how to run your AI Visibility MVP anywhere. 🚀
