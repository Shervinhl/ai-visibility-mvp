# Quick Reference Card - Keep This Open!

## 🚀 The 4 Phases (30 minutes total)

```
PHASE 1: Backend → Railway (10 min)
  ↓
PHASE 2: Frontend → Local (10 min)
  ↓
PHASE 3: Frontend → Netlify (5 min)
  ↓
PHASE 4: Test Everything (5 min)
```

---

## 📍 PHASE 1: Backend on Railway

### 1️⃣ GitHub (3 min)
```bash
cd ai-visibility-mvp
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR/mvp.git
git branch -M main && git push -u origin main
```
→ Go to https://github.com/new and create repo

### 2️⃣ Railway Deploy (3 min)
```
https://railway.app
  → New Project
  → Deploy from GitHub
  → Select ai-visibility-mvp
  → Wait for build ✓
```

### 3️⃣ Add Database (2 min)
```
Railway Dashboard
  → Add Service
  → PostgreSQL
  → Wait ✓
```

### 4️⃣ Environment Variables (1 min)
```
In Railway Variables add:
  NODE_ENV=production
  JWT_SECRET=abc123def456
  API_PORT=5000
```

### 5️⃣ Copy Your URL
```
Railway → Deployments → Domains
Copy: https://your-backend-xxx.up.railway.app
Save in notepad!
```

### ✅ Test Backend
```bash
curl https://YOUR_URL/health
→ {"status":"ok"}
```

---

## 🎨 PHASE 2: Frontend Locally

### 1️⃣ Create React App (2 min)
```bash
cd ..
npx create-react-app ai-visibility-frontend
cd ai-visibility-frontend
```

### 2️⃣ Environment Setup (1 min)
```bash
echo "REACT_APP_API_URL=https://your-backend-xxx.up.railway.app" > .env
npm install axios
```

### 3️⃣ Create Component (5 min)
```bash
mkdir -p src/components
# Create src/components/AuditForm.tsx
# Copy code from STEP_BY_STEP_SETUP.md section 2.4
```

### 4️⃣ Update App (1 min)
```bash
# Edit src/App.tsx
# Copy code from STEP_BY_STEP_SETUP.md section 2.5
```

### 5️⃣ Test Locally (1 min)
```bash
npm start
→ http://localhost:3000
→ Try audit with example.com
```

---

## 🌐 PHASE 3: Deploy to Netlify

### 1️⃣ GitHub Frontend (3 min)
```bash
git init && git add . && git commit -m "frontend"
# Create https://github.com/new ai-visibility-frontend
git remote add origin https://github.com/YOUR/frontend.git
git branch -M main && git push -u origin main
```

### 2️⃣ Netlify Deploy (3 min)
```
https://app.netlify.com
  → Add new site
  → Import existing project
  → GitHub
  → ai-visibility-frontend
  → Deploy
  → Wait ✓
```

### 3️⃣ Environment Variables (1 min)
```
Netlify Dashboard
  → Settings → Environment
  → Add REACT_APP_API_URL=https://your-backend-url
  → Trigger Deploy
```

### 4️⃣ Get Frontend URL
```
Netlify → Deployments
Copy: https://your-site-xyz.netlify.app
Save in notepad!
```

---

## ✅ PHASE 4: Test Everything

### 1️⃣ Test Backend Health
```bash
curl https://YOUR_BACKEND_URL/health
# Should return {"status":"ok"}
```

### 2️⃣ Visit Frontend
```
Open: https://your-site-xyz.netlify.app
Should see: "🎯 AI Visibility Audit" form
```

### 3️⃣ Create Audit
```
1. Enter: example.com
2. Click: Start Audit
3. Wait: 30-40 seconds
4. See: Results table with signals
```

### 4️⃣ Check Logs
```
Railway → Logs
Should see: API requests, no errors
```

---

## 🎯 YOUR FINAL URLS

```
Frontend:  https://your-site-xyz.netlify.app
Backend:   https://your-backend-xxx.up.railway.app
```

Send frontend URL to users!

---

## 🚀 Going Forward

### Update Backend
```bash
cd ai-visibility-mvp
# Make changes
git add . && git commit -m "msg" && git push
# Railway auto-deploys (2 min)
```

### Update Frontend  
```bash
cd ai-visibility-frontend
# Make changes
git add . && git commit -m "msg" && git push
# Netlify auto-deploys (1 min)
```

### Monitor
```
Railway: https://railway.app/dashboard
Netlify: https://app.netlify.com
```

---

## ⚠️ If Something Goes Wrong

### Frontend can't reach backend
- Check .env has correct API_URL
- Check Netlify has REACT_APP_API_URL variable
- Trigger redeploy in Netlify
- Hard refresh browser (Ctrl+Shift+R)

### Backend build failed
- Check Railway logs
- Push code to GitHub again
- Railway will retry automatically

### Audit times out
- Try with smaller domain
- Check Railway logs for errors

---

## 📊 Time Breakdown

```
PHASE 1 (Backend):      10 min  ✅
PHASE 2 (Frontend):     10 min  ✅
PHASE 3 (Netlify):       5 min  ✅
PHASE 4 (Testing):       5 min  ✅
                        -------
TOTAL:                  30 min  ✅
```

---

## 🎉 Success Checklist

- [ ] Backend URL works (health endpoint)
- [ ] Frontend loads in browser
- [ ] Frontend connects to backend
- [ ] Can create audit from frontend
- [ ] Audit completes and shows results
- [ ] Backend logs show no errors
- [ ] Both dashboards (Railway + Netlify) are accessible

---

## 📞 Quick Links

```
GitHub:   https://github.com
Railway:  https://railway.app
Netlify:  https://app.netlify.com
```

---

## 💾 Save Your Notes

```
🔗 Frontend URL:
   

🔗 Backend URL:
   

🔗 GitHub Frontend:
   

🔗 GitHub Backend:
   

🔑 JWT Secret:
   
```

---

**Print this card and follow the phases!** ✨
