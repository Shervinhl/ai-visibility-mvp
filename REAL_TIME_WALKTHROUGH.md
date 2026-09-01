# Real-Time Walkthrough (Read & Follow Along)

Follow along with this guide in real-time. Open it alongside your terminal.

---

## ⏱️ PART 1: Backend on Railway (10 minutes)

### Step 1.1: Open Your Terminal
```
Open terminal/command prompt
```

### Step 1.2: Navigate to Your Project
```bash
# Navigate to where ai-visibility-mvp is located
cd /path/to/ai-visibility-mvp

# List files to confirm you're in right place
ls -la

# You should see: backend/, docker-compose.yml, .env.example, README.md, etc.
```

**✓ If you see those files, you're in the right place. Continue.**

### Step 1.3: Initialize Git
```bash
# Initialize git repository
git init

# Verify git is initialized (should see "Initialized empty Git repository")
```

### Step 1.4: Add All Files to Git
```bash
# Add all files
git add .

# Verify files are staged (should show many files)
git status

# You should see "Changes to be committed" with your files listed
```

**✓ All files staged. Continue.**

### Step 1.5: Create First Commit
```bash
# Commit all files
git commit -m "Initial AI Visibility MVP commit"

# You should see "create mode" messages for many files
```

**✓ Files committed. Continue.**

### Step 1.6: Create GitHub Repository
**In your web browser:**

1. Go to https://github.com
2. Login to your account
3. Click "New" button (or go to https://github.com/new)
4. Repository name: `ai-visibility-mvp` (exactly this)
5. Make it Private or Public (doesn't matter)
6. DON'T check "Initialize this repository with:" (we have files)
7. Click "Create repository"

**✓ GitHub repo created. Continue.**

### Step 1.7: Push Code to GitHub
**Back in your terminal:**

```bash
# Copy the first command from GitHub's instructions
# It looks like this (replace YOUR_USERNAME):
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git

# Rename branch to main
git branch -M main

# Push code to GitHub
git push -u origin main

# First time may take 30-60 seconds
# Should see "Counting objects", "Compressing objects", etc.
# Should end with: "To https://github.com/YOUR_USERNAME/ai-visibility-mvp.git" and branch info
```

**✓ Code pushed to GitHub. Continue.**

### Step 1.8: Verify on GitHub
**In web browser:**

1. Go to https://github.com/YOUR_USERNAME/ai-visibility-mvp
2. Refresh the page
3. Should now see all your files (backend/, docker-compose.yml, etc.)

**✓ GitHub verified. Continue.**

### Step 1.9: Deploy on Railway
**In web browser:**

1. Go to https://railway.app
2. Click "Start a New Project" (or "New Project")
3. Click "Deploy from GitHub"
4. Click "Connect GitHub" (first time only)
5. Authorize Railway to access GitHub
6. Select `ai-visibility-mvp` from the list
7. Wait for Railway to build (you'll see build progress)

**Status will change:**
- ⏳ Building → 🟡 Deploying → ✅ Success

This takes 2-3 minutes. Watch the logs.

**✓ Backend built and deployed. Continue.**

### Step 1.10: Add PostgreSQL Database
**In Railway dashboard:**

1. You should see your deployed service
2. Click "+ Add Service" button
3. In the popup, type "postgres"
4. Click "PostgreSQL" when it appears
5. Click "Deploy" to add it
6. Wait for PostgreSQL to initialize (1-2 minutes)

**✓ Database added. Continue.**

### Step 1.11: Set Environment Variables
**In Railway dashboard:**

1. Click on your web service (not the database)
2. Go to "Variables" tab
3. Add these 4 variables (click "+ Add Variable" each time):

```
Variable 1:
  Name: NODE_ENV
  Value: production

Variable 2:
  Name: JWT_SECRET
  Value: your-secret-key-abc123def456 (anything random)

Variable 3:
  Name: API_PORT
  Value: 5000

Variable 4:
  Name: LOG_LEVEL
  Value: info
```

4. After adding all 4, they should auto-save

**✓ Variables set. Continue.**

### Step 1.12: Get Your Backend URL
**In Railway dashboard:**

1. Go to your web service
2. Click "Deployments" tab
3. You should see one deployment with green checkmark
4. Click on it
5. Look for "Domains" section
6. Copy the URL (looks like: `https://ai-visibility-xxxx.up.railway.app`)

**SAVE THIS URL - You'll need it for frontend!**

Paste it here:
```
Backend URL: _______________________________
```

### Step 1.13: Test Backend Works
**In terminal or browser:**

```bash
# Replace YOUR_URL with the URL you saved above
curl https://YOUR_URL/health

# Example:
curl https://ai-visibility-xyz12.up.railway.app/health

# You should see:
# {"status":"ok","timestamp":"2024-...","uptime":123}
```

**✓ If you see JSON response, backend is working!**

---

## ⏱️ PART 2: Frontend Locally (10 minutes)

### Step 2.1: Open New Terminal Window
```
Keep the first terminal open
Open a NEW terminal window for the frontend
```

### Step 2.2: Navigate to Parent Directory
```bash
# Go to the parent directory (where ai-visibility-mvp is)
cd ..

# Verify you're in the right place
ls -la

# You should see: ai-visibility-mvp/, (and maybe other folders)
```

**✓ In correct directory. Continue.**

### Step 2.3: Create React Application
```bash
# This creates a new React project
# It will take 1-2 minutes
npx create-react-app ai-visibility-frontend

# Wait for completion - should see "Happy hacking!"
```

**✓ React app created. Continue.**

### Step 2.4: Navigate to Frontend Directory
```bash
# Move into the new frontend directory
cd ai-visibility-frontend

# Verify you're in the right place
ls -la

# You should see: src/, public/, package.json, node_modules/, etc.
```

**✓ In frontend directory. Continue.**

### Step 2.5: Create Environment File
```bash
# Create .env file with your backend URL
echo "REACT_APP_API_URL=https://YOUR_BACKEND_URL" > .env

# Replace YOUR_BACKEND_URL with the URL you saved in Step 1.12
# Example:
echo "REACT_APP_API_URL=https://ai-visibility-xyz12.up.railway.app" > .env

# Verify the file was created
cat .env

# Should show: REACT_APP_API_URL=https://your-url...
```

**✓ Environment file created. Continue.**

### Step 2.6: Install Axios
```bash
# Install the HTTP client library
npm install axios

# Should complete without errors
```

**✓ Axios installed. Continue.**

### Step 2.7: Create Components Folder
```bash
# Create the components directory
mkdir -p src/components

# Verify it was created
ls -la src/
# Should show: components/ folder
```

**✓ Components folder created. Continue.**

### Step 2.8: Create AuditForm Component
**Using your code editor:**

1. Open `ai-visibility-frontend/src/components/`
2. Create new file: `AuditForm.tsx`
3. Copy the entire code from STEP_BY_STEP_SETUP.md, section 2.4
4. Paste into the file
5. Save the file

**✓ AuditForm component created. Continue.**

### Step 2.9: Update App Component
**Using your code editor:**

1. Open `ai-visibility-frontend/src/App.tsx`
2. Delete all existing content
3. Copy the entire code from STEP_BY_STEP_SETUP.md, section 2.5
4. Paste into the file
5. Save the file

**✓ App component updated. Continue.**

### Step 2.10: Start Development Server
```bash
# Start the React development server
npm start

# Should automatically open http://localhost:3000 in your browser
# Wait for compilation to complete
# Should see: "Compiled successfully!"
```

**✓ Server is running. Continue.**

### Step 2.11: Test Frontend Locally
**In your browser:**

1. You should see "🎯 AI Visibility Audit" form
2. Open browser console (F12 key, then "Console" tab)
3. Check that there are no red error messages
4. Try entering a domain: `example.com`
5. Click "🚀 Start Audit"
6. Wait 30-40 seconds
7. Should see results table with signals

**✓ If you see results, frontend is working!**

### Step 2.12: Stop the Server
```bash
# In terminal where npm start is running
# Press: Ctrl+C

# Should stop the server
```

---

## ⏱️ PART 3: Deploy Frontend to Netlify (5 minutes)

### Step 3.1: Initialize Git for Frontend
**In terminal (should be in ai-visibility-frontend directory):**

```bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "AI Visibility Frontend"

# Verify you're committed
git status
# Should show: "nothing to commit, working tree clean"
```

**✓ Git initialized. Continue.**

### Step 3.2: Create GitHub Repo for Frontend
**In web browser:**

1. Go to https://github.com/new
2. Repository name: `ai-visibility-frontend` (exactly this)
3. Make it Private or Public (doesn't matter)
4. DON'T check "Initialize with README"
5. Click "Create repository"

**✓ GitHub repo created. Continue.**

### Step 3.3: Push Frontend to GitHub
**In terminal:**

```bash
# Add remote (copy from GitHub page, replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-frontend.git

# Rename branch to main
git branch -M main

# Push code
git push -u origin main

# Should complete with branch tracking info
```

**✓ Frontend pushed to GitHub. Continue.**

### Step 3.4: Connect to Netlify
**In web browser:**

1. Go to https://app.netlify.com
2. Sign up / Login (can use GitHub account)
3. Once logged in, click "Add new site"
4. Select "Import an existing project"
5. Select "GitHub"
6. Click "Authorize Netlify"
7. You may need to authorize GitHub access
8. Select `ai-visibility-frontend` from your repositories list
9. Should show build settings

**✓ Connected to Netlify. Continue.**

### Step 3.5: Configure Netlify Build
**In Netlify configuration page:**

1. Build command should be: `npm run build` (usually default)
2. Publish directory should be: `build` (usually default)
3. Click "Deploy site"
4. Wait for build (2-3 minutes)
5. Watch the build log for progress

**Status will change:**
- ⏳ Building → 🟡 Deploying → ✅ Published

**✓ Frontend deployed to Netlify. Continue.**

### Step 3.6: Set Environment Variable in Netlify
**In Netlify dashboard:**

1. Click on your site
2. Go to "Site settings" (top menu)
3. Go to "Build & deploy" (left sidebar)
4. Go to "Environment" section
5. Click "Edit variables"
6. Click "Add variable"
7. Add:
   - Key: `REACT_APP_API_URL`
   - Value: `https://YOUR_BACKEND_URL` (from Step 1.12)
8. Save
9. Back in Deployments, click "Trigger deploy" to redeploy with new variable

**✓ Environment variable set. Continue.**

### Step 3.7: Get Your Frontend URL
**In Netlify dashboard:**

1. Go to "Deployments"
2. Find the most recent deployment with green checkmark
3. Copy the site URL (looks like: `https://your-site-xyz.netlify.app`)

**SAVE THIS URL - This is what you share with users!**

Paste it here:
```
Frontend URL: _______________________________
```

---

## ⏱️ PART 4: Test Everything (5 minutes)

### Step 4.1: Test Backend Health
**In terminal:**

```bash
# Test the health endpoint
curl https://YOUR_BACKEND_URL/health

# Replace YOUR_BACKEND_URL with URL from Step 1.12
# Should return: {"status":"ok",...}
```

**✓ Backend health check passed. Continue.**

### Step 4.2: Visit Frontend
**In web browser:**

1. Open your frontend URL (from Step 3.7)
2. Should see "🎯 AI Visibility Audit" form
3. Open browser console (F12)
4. Check for no red error messages

**✓ Frontend loads. Continue.**

### Step 4.3: Create Test Audit
**In frontend:**

1. Enter domain: `example.com`
2. Click "🚀 Start Audit"
3. Watch browser console for progress
4. Wait 30-40 seconds
5. Should see results table appear
6. Should show signal names and scores

**✓ Full audit works! Continue.**

### Step 4.4: Check Backend Logs
**In Railway dashboard:**

1. Go to your web service
2. Click "Logs" tab
3. Should see incoming requests from your Netlify frontend
4. Should see no error messages (red text)
5. Should see "Audit completed" messages

**✓ Backend processing confirmed.**

---

## 🎉 SUCCESS!

Your full stack is now live!

### Your URLs:
```
Frontend: https://your-site-xyz.netlify.app
Backend:  https://your-backend-xxx.up.railway.app
```

### What's Running:
✅ Frontend hosted on Netlify (global CDN)
✅ Backend API on Railway
✅ PostgreSQL database
✅ Web crawler processing audits
✅ Signal computation
✅ Both auto-deploying on git push

### Next Steps:
1. Share the frontend URL with others
2. Monitor both dashboards (Railway + Netlify)
3. Make code changes and push to GitHub
4. Both platforms automatically deploy
5. Scale as needed

---

## 🔄 How to Update Going Forward

### If You Change Backend Code:
```bash
cd ai-visibility-mvp
# Make changes
git add .
git commit -m "Your change description"
git push origin main
# Railway automatically deploys (2-3 min)
```

### If You Change Frontend Code:
```bash
cd ai-visibility-frontend
# Make changes
git add .
git commit -m "Your change description"
git push origin main
# Netlify automatically deploys (1-2 min)
```

### To Monitor:
- Railway Dashboard: https://railway.app/dashboard
- Netlify Dashboard: https://app.netlify.com/

---

## ❗ Troubleshooting

### Frontend shows "Error: Failed to fetch"
1. Check Netlify dashboard
2. Check REACT_APP_API_URL environment variable
3. Click "Trigger Deploy"
4. Hard refresh browser (Ctrl+Shift+R)

### Audit doesn't complete
1. Check Railway logs for errors
2. Try with simpler domain (example.com)
3. Check if website is very large/slow

### Backend says build failed
1. Check Railway deployment logs
2. Fix error in code
3. Push to GitHub again
4. Railway will retry

---

## 🎊 Congratulations!

You've successfully deployed a production-ready MVP!

**Your stack is now:**
- ✅ Professionally hosted
- ✅ Automatically scaled
- ✅ Easy to update
- ✅ Production-grade

**Enjoy!** 🚀
