# Deploy AI Visibility MVP to Railway - 5 Minute Guide

**Railway.app** is the easiest way to deploy your MVP online. This guide gets you from zero to live in 5 minutes.

---

## ⚡ Quick Start (2 Steps)

### Step 1: Push to GitHub (2 minutes)

```bash
cd ai-visibility-mvp

# Initialize git (if not done)
git init
git add .
git commit -m "Initial commit"

# Create repository on GitHub
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Railway (3 minutes)

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub"**
4. Select your `ai-visibility-mvp` repository
5. Wait for build to complete (~2-3 minutes)
6. **Done!** 🎉

Your API is now live at: `https://your-project-xxx.up.railway.app`

---

## 🗄️ Add Database (1 minute)

After initial deployment:

1. In Railway dashboard, click **"Add Service"**
2. Search for and select **"PostgreSQL"**
3. Click **"Deploy"**
4. Railway automatically sets `DATABASE_URL` environment variable

---

## 🔧 Configure Environment Variables (1 minute)

1. Go to your project in Railway
2. Click on the web service
3. Go to **"Variables"** tab
4. Add these variables:

```
NODE_ENV=production
JWT_SECRET=your-random-secret-key
LOG_LEVEL=info
API_PORT=5000
```

(Leave DATABASE_URL as is - Railway sets it automatically)

---

## ✅ Test Your Deployment

### 1. Check Health
```bash
curl https://your-project-xxx.up.railway.app/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-...","uptime":...}
```

### 2. Create Your First Audit
```bash
curl -X POST https://your-project-xxx.up.railway.app/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{"organizationName":"Example","domain":"example.com","websiteUrl":"https://example.com"}'
```

### 3. Check Results
```bash
# Replace {audit-id} with ID from previous response
curl https://your-project-xxx.up.railway.app/api/v1/audits/{audit-id}
```

---

## 🚀 Auto-Deploy on Git Push

After initial setup, every time you push to GitHub:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Railway automatically:
1. Detects changes
2. Rebuilds code
3. Deploys new version
4. Updates live API

No manual steps needed! 🎉

---

## 📊 Your Deployed Stack

After following above steps, you'll have:

✅ **Express API Server**
   - Running at: https://your-project-xxx.up.railway.app
   - Auto-restarts on failure
   - Logs available in Railway dashboard

✅ **PostgreSQL Database**
   - Automatically provisioned
   - Connection string set in environment
   - Backups available

✅ **Auto Scaling**
   - Railway manages infrastructure
   - Automatically scales resources as needed

✅ **SSL/HTTPS**
   - Automatically enabled
   - Free certificates

---

## 🎯 API Endpoints (Now Online)

Your deployed API has these endpoints:

```
POST   https://your-project-xxx.up.railway.app/api/v1/audits
GET    https://your-project-xxx.up.railway.app/api/v1/audits/{id}
GET    https://your-project-xxx.up.railway.app/api/v1/audits/{id}/signals
DELETE https://your-project-xxx.up.railway.app/api/v1/audits/{id}
GET    https://your-project-xxx.up.railway.app/health
```

---

## 💰 Cost

- **Starter plan**: $5/month
- **If you need more resources**: Pay-as-you-go ($0.10/hour for additional)
- **Total for MVP**: $20-50/month

---

## 📈 Monitor Your App

In Railway dashboard:

1. **Logs**: See real-time application logs
2. **Metrics**: CPU, memory, response time
3. **Deployments**: History of all deployments
4. **Environment**: View and edit variables

---

## 🔄 Update Your App

To push new code:

```bash
cd ai-visibility-mvp
git add .
git commit -m "Your changes"
git push origin main
```

Railway automatically deploys in ~2 minutes.

---

## ❌ Troubleshooting

### "Cannot connect to database"
1. Check DATABASE_URL in Variables
2. Wait 30 seconds for database to start
3. Restart deployment in Railway

### "Application crash"
1. Check logs in Railway dashboard
2. Verify all environment variables are set
3. Check DATABASE_URL exists

### "Slow response times"
1. Railway may be on free tier resource
2. Upgrade to paid plan for better performance

### "Cannot push to GitHub"
```bash
# Check git config
git config --list

# Verify SSH keys are added to GitHub
# Or use HTTPS token instead
```

---

## 🎓 Next Steps

### After Deployment
1. ✅ Test API with curl commands
2. ✅ Monitor logs in Railway
3. ✅ Add more environment variables as needed
4. ✅ Keep deploying improvements

### Adding More Features
1. Update code locally
2. Test locally: `npm run dev`
3. Push to GitHub: `git push origin main`
4. Railway deploys automatically

### Scale When Needed
1. Upgrade Railway plan for more resources
2. Add Redis for caching
3. Enable database backups

---

## 🔗 Useful Links

- **Railway Dashboard**: https://railway.app/dashboard
- **Documentation**: https://docs.railway.app
- **Status**: https://railway.app/status
- **Support**: https://discord.gg/railway

---

## 📝 Your Deployment Checklist

- [ ] Push code to GitHub
- [ ] Sign up for Railway (https://railway.app)
- [ ] Deploy from GitHub
- [ ] Add PostgreSQL database
- [ ] Set environment variables
- [ ] Test health endpoint
- [ ] Create first audit
- [ ] Check logs
- [ ] Monitor performance

---

## 🎉 You're Done!

Your AI Visibility MVP is now **live on the internet**!

**Your API URL**: https://your-project-xxx.up.railway.app

Share this URL to:
- Test with different tools
- Integrate with frontend
- Monitor performance
- Scale for production

---

## 💡 Pro Tips

### Custom Domain (Optional)
1. In Railway, go to Settings
2. Add custom domain
3. Point DNS to Railway
4. Free SSL certificate

### Environment-Specific Config
Add different variables for staging/production:
```
NODE_ENV=production
API_URL=https://your-project-xxx.up.railway.app
```

### Database Management
Access PostgreSQL database:
```bash
# In Railway, click on PostgreSQL service
# Copy connection string
# Connect with any PostgreSQL client
```

### Backup Strategy
1. Enable automatic backups in PostgreSQL settings
2. Keep at least 7-day backup retention
3. Test restore procedure occasionally

---

**Questions?** Check Railway docs or Discord community!

**Ready?** https://railway.app 🚀
