# Deploy AI Visibility MVP Online - Quick Overview

Your MVP backend can run on the internet for $5-50/month. Choose your platform and follow the guide.

---

## ⚡ Fastest (5 minutes) - RECOMMENDED FOR MVP

### **Railway.app** 
- **Setup**: 5 minutes
- **Cost**: $5-30/month
- **Best for**: MVP, quick launch
- **Guide**: RAILWAY_DEPLOYMENT.md

```bash
1. Push to GitHub
2. Sign up: https://railway.app
3. Connect GitHub repo
4. Railway deploys automatically
5. Add PostgreSQL database
6. Done! 🎉
```

**Your API**: `https://your-project-xxx.up.railway.app`

---

## ✅ Also Easy (5-10 minutes)

### **Render.app**
- **Setup**: 10 minutes  
- **Cost**: $7-30/month
- **Best for**: Free tier available
- **Guide**: CLOUD_DEPLOYMENT_GUIDE.md (Option 3)

### **Heroku**
- **Setup**: 10 minutes
- **Cost**: $22-72/month
- **Best for**: Established users
- **Guide**: CLOUD_DEPLOYMENT_GUIDE.md (Option 1)

---

## 🏢 Enterprise Options (20+ minutes)

### **AWS**
- **Setup**: 20 minutes
- **Cost**: $33-170/month
- **Best for**: Production, scale
- **Guide**: CLOUD_DEPLOYMENT_GUIDE.md (Option 4)

### **Google Cloud**
- **Setup**: 20 minutes
- **Cost**: $15-100/month (free credits)
- **Best for**: Production, Google ecosystem
- **Guide**: CLOUD_DEPLOYMENT_GUIDE.md (Option 5)

### **Azure**
- **Setup**: 20 minutes
- **Cost**: $15-100/month
- **Best for**: Microsoft ecosystem
- **Guide**: CLOUD_DEPLOYMENT_GUIDE.md (Option 6)

### **DigitalOcean**
- **Setup**: 15 minutes
- **Cost**: $5-20/month
- **Best for**: Learning, VPS control
- **Guide**: CLOUD_DEPLOYMENT_GUIDE.md (Option 6)

---

## 📊 Quick Comparison

| Platform | Setup | Cost | Learning | Free Tier | Best For |
|----------|-------|------|----------|-----------|----------|
| Railway | ⚡⚡ | $$ | Easy | Yes | **MVP** ✅ |
| Render | ⚡ | $$ | Easy | Yes | MVP |
| Heroku | ⚡ | $$$ | Easy | Limited | MVP |
| DigitalOcean | ⚡⚡ | $ | Medium | No | Learning |
| AWS | 🕐 | $$ | Hard | Yes | Production |
| GCP | 🕐 | $$ | Medium | Yes | Production |
| Azure | 🕐 | $$ | Medium | No | Production |

**Legend**: ⚡ = 5-10 min | 🕐 = 20+ min | $ = $5-20/mo | $$ = $20-50/mo | $$$ = $50+/mo

---

## 🚀 RECOMMENDED PATH: Railway in 10 Minutes

### 1. Prepare Code (2 minutes)

```bash
cd ai-visibility-mvp

# Initialize git
git init
git add .
git commit -m "AI Visibility MVP"

# Create GitHub repo and push
# (create empty repo on github.com first, then:)
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Railway (3 minutes)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub"
4. Select your repo
5. Wait for build

### 3. Add Database (2 minutes)

1. In Railway, click "Add Service"
2. Select "PostgreSQL"
3. Wait for deployment

### 4. Set Environment (2 minutes)

1. In Railway, click your web service
2. Go to Variables
3. Add:
   ```
   NODE_ENV=production
   JWT_SECRET=your-random-key
   ```

### 5. Test (1 minute)

```bash
# Your API URL (from Railway)
curl https://your-project-xxx.up.railway.app/health

# Create audit
curl -X POST https://your-project-xxx.up.railway.app/api/v1/audits \
  -H "Content-Type: application/json" \
  -d '{"organizationName":"Test","domain":"example.com","websiteUrl":"https://example.com"}'
```

**Total Time: 10 minutes**
**Your API is LIVE** 🎉

---

## 💰 Cost Breakdown (Railway)

- **Hobby plan**: Free trial (limited)
- **Starter**: $5/month
- **Growing**: $20-50/month
- **Scaling**: $50-100+/month

For MVP: **$20-30/month** is plenty

---

## 🔄 How Updates Work

After initial deployment, updates are automatic:

```bash
# Make code changes
cd ai-visibility-mvp/backend/src
# ... edit files ...

# Push to GitHub
cd ../..
git add .
git commit -m "Add new feature"
git push origin main

# Railway automatically:
# 1. Detects change
# 2. Rebuilds app
# 3. Deploys new version
# (All in ~2 minutes)
```

No manual deployment needed!

---

## 🎯 What You Can Do Online

Once deployed, you can:

✅ Create audits via API
✅ Monitor website signals  
✅ Check audit results
✅ View performance metrics
✅ Access logs
✅ Scale infrastructure

---

## 🔒 Security (Production Checklist)

Before going to production:

- [ ] Use strong JWT_SECRET (use `openssl rand -hex 32`)
- [ ] Enable database backups
- [ ] Use HTTPS (automatic on Railway)
- [ ] Set strong database password
- [ ] Keep API key secure
- [ ] Monitor logs for errors
- [ ] Enable rate limiting (future)
- [ ] Add authentication (future)

---

## 📈 Performance

Expected performance online:

- **API Response**: <100ms
- **Crawl Time**: 10-30 seconds (depends on site size)
- **Audit Completion**: 15-40 seconds total
- **Uptime**: 99.9%+ (Railway managed)

---

## 🚦 Monitoring

In Railway dashboard, you can see:

- **Real-time logs**: All API requests
- **Metrics**: CPU, memory, response time
- **Deployments**: History and status
- **Environment**: Variables and secrets
- **Crashes**: Alerts when app fails

---

## 💡 Pro Tips

### Use a Custom Domain
```
1. Buy domain (Namecheap, GoDaddy, etc.)
2. In Railway, add custom domain
3. Point DNS to Railway
4. SSL certificate free
```

### Integrate with Frontend
```javascript
// Your frontend can now call:
const API_URL = 'https://your-project-xxx.up.railway.app';

fetch(`${API_URL}/api/v1/audits`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...})
})
```

### Use with Tools
```bash
# Postman: Set URL to https://your-project-xxx.up.railway.app
# curl: Use full URL in commands
# Python: requests.post('https://your-project-xxx.up.railway.app/...')
# JavaScript: fetch('https://your-project-xxx.up.railway.app/...')
```

---

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| "Build failed" | Check logs in Railway, fix errors, push again |
| "Cannot connect to DB" | Wait 30s for database, verify DATABASE_URL set |
| "Slow response" | Upgrade Railway plan, add Redis caching |
| "Crashes on startup" | Check environment variables are all set |

---

## 🎓 Learning Path

1. **Deploy** (10 min) - Get app online
2. **Test** (5 min) - Make sure it works
3. **Monitor** (5 min) - Check logs and metrics
4. **Update** (5 min) - Push code changes
5. **Scale** (future) - Add more features

---

## 🚀 Let's Get Started!

### Choose your platform:

**🏃 For Speed (Recommended):**
→ **RAILWAY_DEPLOYMENT.md**
Deploy in 10 minutes!

**📚 For Details:**
→ **CLOUD_DEPLOYMENT_GUIDE.md**
All platforms explained

**🎯 For Quick Overview:**
→ This file (you are here!)

---

## Next Step

1. Read **RAILWAY_DEPLOYMENT.md** (5 min)
2. Follow the steps (10 min)
3. Your API is live! 🎉

**Your URL will be**: `https://your-project-xyz.up.railway.app`

---

**Need more info?** Check the detailed guides or Railway docs.
**Ready?** Go to https://railway.app 🚀
