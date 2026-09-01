# Deployment Checklist - Print This!

## 🎯 PHASE 1: Backend Setup (Railway) - 10 min
**Time to complete this phase: 10 minutes**

### Prepare Backend Code
- [ ] Navigate to ai-visibility-mvp directory
- [ ] Initialize git: `git init`
- [ ] Add files: `git add .`
- [ ] Commit: `git commit -m "Initial commit"`
- [ ] Verify files exist: `ls -la`

### Create GitHub Repo
- [ ] Go to https://github.com/new
- [ ] Name it: `ai-visibility-mvp`
- [ ] Create repository (don't initialize)
- [ ] Copy the git commands

### Push to GitHub
- [ ] Run: `git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git`
- [ ] Run: `git branch -M main`
- [ ] Run: `git push -u origin main`
- [ ] Verify on GitHub (refresh page, should see files)

### Deploy on Railway
- [ ] Go to https://railway.app
- [ ] Sign up / login
- [ ] Click "New Project"
- [ ] Select "Deploy from GitHub"
- [ ] Click "Connect GitHub" (authorize access)
- [ ] Select ai-visibility-mvp repository
- [ ] Wait for build (2-3 min) - watch the build log

### Add PostgreSQL Database
- [ ] In Railway, click "Add Service"
- [ ] Search and select "PostgreSQL"
- [ ] Wait for deployment (1-2 min)
- [ ] Verify DATABASE_URL is set (auto-added)

### Set Environment Variables
- [ ] Go to web service settings
- [ ] Click "Variables" tab
- [ ] Add: `NODE_ENV` = `production`
- [ ] Add: `JWT_SECRET` = (random string)
- [ ] Add: `API_PORT` = `5000`
- [ ] Add: `LOG_LEVEL` = `info`
- [ ] Save variables

### Get Backend URL
- [ ] Go to Railway Deployments
- [ ] Click on your service
- [ ] Find "Domains" section
- [ ] Copy your URL (example: https://ai-visibility-xyz.up.railway.app)
- [ ] **Save this URL in a notepad file!**

### Test Backend
```bash
curl https://YOUR_URL/health
# Should return: {"status":"ok",...}
```
- [ ] Verify health endpoint responds

**✅ PHASE 1 COMPLETE!**

---

## 🎨 PHASE 2: Frontend Setup (Local) - 10 min
**Time to complete this phase: 10 minutes**

### Create React App
- [ ] Navigate to parent directory: `cd ..`
- [ ] Run: `npx create-react-app ai-visibility-frontend`
- [ ] Navigate to frontend: `cd ai-visibility-frontend`
- [ ] Verify folders exist: `ls -la`

### Set Environment Variable
- [ ] Run: `echo "REACT_APP_API_URL=https://YOUR_BACKEND_URL" > .env`
- [ ] Replace YOUR_BACKEND_URL with your actual URL from Phase 1
- [ ] Verify: `cat .env` (should show your URL)

### Install Dependencies
- [ ] Run: `npm install axios`
- [ ] Should complete without errors

### Create Audit Component
- [ ] Create directory: `mkdir -p src/components`
- [ ] Create file: `src/components/AuditForm.tsx`
- [ ] Copy TypeScript code from STEP_BY_STEP_SETUP.md section 2.4
- [ ] Paste entire code block into file
- [ ] Save file

### Update App Component
- [ ] Open `src/App.tsx`
- [ ] Replace contents with code from section 2.5
- [ ] Save file

### Test Locally
- [ ] Run: `npm start`
- [ ] Should open http://localhost:3000 in browser
- [ ] Should see: "🎯 AI Visibility Audit" form
- [ ] Try creating audit with "example.com"
- [ ] Wait for results (30-40 sec)
- [ ] Should show signals and scores

**✅ PHASE 2 COMPLETE!**

---

## 🚀 PHASE 3: Deploy Frontend (Netlify) - 5 min
**Time to complete this phase: 5 minutes**

### Push Frontend to GitHub
- [ ] In ai-visibility-frontend directory
- [ ] Run: `git init`
- [ ] Run: `git add .`
- [ ] Run: `git commit -m "AI Visibility Frontend"`
- [ ] Go to https://github.com/new
- [ ] Create repo named: `ai-visibility-frontend`
- [ ] Run: `git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-frontend.git`
- [ ] Run: `git branch -M main`
- [ ] Run: `git push -u origin main`
- [ ] Verify on GitHub (should see files)

### Connect to Netlify
- [ ] Go to https://app.netlify.com
- [ ] Sign up / login with GitHub
- [ ] Click "Add new site"
- [ ] Select "Import an existing project"
- [ ] Choose "GitHub"
- [ ] Authorize if needed
- [ ] Select ai-visibility-frontend repo

### Configure Build
- [ ] Build command: `npm run build` (should be default)
- [ ] Publish directory: `build` (should be default)
- [ ] Click "Deploy site"
- [ ] Wait for build (2-3 min) - watch deploy log
- [ ] When green checkmark appears, build is done

### Set Environment Variable
- [ ] Go to Site settings → Environment
- [ ] Click "Edit variables"
- [ ] Add variable:
  - [ ] Key: `REACT_APP_API_URL`
  - [ ] Value: `https://YOUR_BACKEND_URL` (from Phase 1)
- [ ] Save variables
- [ ] Trigger redeploy (Deployments → Trigger deploy)

### Get Frontend URL
- [ ] In Netlify Deployments
- [ ] Find green checkmark deployment
- [ ] Copy URL (example: https://your-site-xyz.netlify.app)
- [ ] **Save this URL in your notepad file!**

**✅ PHASE 3 COMPLETE!**

---

## ✅ PHASE 4: Test Everything - 5 min
**Time to complete this phase: 5 minutes**

### Test Backend Health
- [ ] Run: `curl https://YOUR_BACKEND_URL/health`
- [ ] Should return JSON with status: "ok"

### Test Frontend Load
- [ ] Open https://your-frontend-url.netlify.app in browser
- [ ] Should see "🎯 AI Visibility Audit" form
- [ ] Open browser console (F12 → Console tab)
- [ ] Check no red errors
- [ ] Check API_URL is correct in console

### Create Test Audit
- [ ] In frontend form, enter: `example.com`
- [ ] Click "🚀 Start Audit"
- [ ] Watch for progress messages in console
- [ ] Wait 30-40 seconds
- [ ] Should show results table with signals
- [ ] Should show scores for each signal

### Verify Backend Processing
- [ ] Go to Railway dashboard
- [ ] Click on your web service
- [ ] Go to Logs tab
- [ ] Should see incoming API requests
- [ ] Should see no error messages (red text)

**✅ PHASE 4 COMPLETE - YOUR STACK IS LIVE! 🎉**

---

## 📊 REFERENCE: Save These URLs!

```
📍 Frontend:    https://your-site-xyz.netlify.app
📍 Backend:     https://your-backend-xxx.up.railway.app
📍 Netlify:     https://app.netlify.com
📍 Railway:     https://railway.app
```

---

## 🚀 ONGOING: How to Update

### To Change Backend Code
```bash
cd ai-visibility-mvp
# Make changes
git add .
git commit -m "Your message"
git push origin main
# Railway auto-deploys (2-3 min)
```

### To Change Frontend Code
```bash
cd ai-visibility-frontend
# Make changes
git add .
git commit -m "Your message"
git push origin main
# Netlify auto-deploys (1-2 min)
```

---

## ❗ COMMON ISSUES & FIXES

### Frontend Can't Connect to Backend
**Problem:** See "Error: Cannot fetch API"

**Fix:**
1. Check .env file has correct URL
2. In Netlify, verify environment variable is set
3. Click "Trigger Deploy" in Netlify
4. Wait for redeploy to complete
5. Hard refresh browser (Ctrl+Shift+R)

### Backend Build Failed
**Problem:** See red X on Railway deployment

**Fix:**
1. Go to Railway → Deployments → Logs
2. Read error message
3. Push fixed code to GitHub
4. Railway auto-retries

### Audit Times Out
**Problem:** Audit takes longer than 10 minutes

**Causes:** Website too large or slow

**Fix:**
1. Try smaller website (example.com)
2. Check Railway logs for errors
3. Can increase CRAWL_TIMEOUT in Railway variables

---

## ✨ SUMMARY

Your full stack is now:

✅ **Frontend** hosted on Netlify (global CDN)
✅ **Backend** running on Railway (full power)
✅ **Database** PostgreSQL on Railway
✅ **Crawler** executing audits
✅ **Auto-deploy** on every git push

**Cost:** $20-50/month

**Speed:** Both deploy automatically in 1-3 minutes after git push

**Monitoring:** Check both dashboards for performance and errors

---

## 🎉 Done!

You now have a production-ready MVP with:
- Professional frontend hosting
- Powerful backend infrastructure  
- Automatic deployments
- Database persistence
- Web crawling capability
- Signal computation

**Congratulations!** 🚀
