# Step-by-Step: Deploy with Netlify + Railway

## 📋 Overview of What We'll Do

```
STEP 1: Backend Setup (Railway) - 10 minutes
STEP 2: Frontend Setup (Local) - 10 minutes  
STEP 3: Deploy Frontend (Netlify) - 5 minutes
STEP 4: Test Everything - 5 minutes
STEP 5: Monitor & Update - Ongoing
```

**Total Time: 30 minutes from now**

---

## ✅ STEP 1: Deploy Backend on Railway (10 minutes)

### 1.1: Prepare Your Backend Code
```bash
# Navigate to your MVP project
cd ai-visibility-mvp

# Initialize git (if not done)
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial AI Visibility MVP"

# List all files to verify
ls -la
# Should show: backend/, docker-compose.yml, .env.example, etc.
```

### 1.2: Create GitHub Repository
1. Go to https://github.com/new
2. Create new repository named: `ai-visibility-mvp`
3. Don't initialize with README (we have files)
4. Click "Create repository"

### 1.3: Push Code to GitHub
```bash
# Add remote origin
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main

# Verify: Go to GitHub and refresh, should see all your files
```

### 1.4: Deploy on Railway
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Click "Connect GitHub" (first time only)
5. Select your `ai-visibility-mvp` repository
6. Wait for build to complete (2-3 minutes)

### 1.5: Add PostgreSQL Database to Railway
1. In Railway dashboard, click "Add Service"
2. Search for "PostgreSQL"
3. Click to add it
4. Wait for deployment (1-2 minutes)
5. Railway automatically sets `DATABASE_URL` environment variable

### 1.6: Set Environment Variables (Railway)
1. In Railway dashboard, click on your web service
2. Go to "Variables" tab
3. Add these variables:
   ```
   NODE_ENV=production
   JWT_SECRET=your-random-secret-key-here
   API_PORT=5000
   LOG_LEVEL=info
   ```

### 1.7: Get Your Backend URL
1. In Railway, go to "Deployments"
2. Click on your service
3. Find "Domains" section
4. Copy the URL (looks like: `https://ai-visibility-xxx.up.railway.app`)
5. **Save this URL - you'll need it for frontend!**

**✅ Backend is now live!**

Test it:
```bash
# Replace YOUR_URL with your actual URL
curl https://YOUR_URL/health

# Should return:
# {"status":"ok","timestamp":"2024-...","uptime":...}
```

---

## 🎨 STEP 2: Create Frontend Locally (10 minutes)

### 2.1: Create React Application
```bash
# Create a new directory for frontend (outside ai-visibility-mvp)
cd ..
npx create-react-app ai-visibility-frontend

# Navigate to frontend directory
cd ai-visibility-frontend

# Should see folders: public/, src/, package.json, etc.
```

### 2.2: Set Environment Variable
```bash
# Create .env file with your backend URL
echo "REACT_APP_API_URL=https://YOUR_BACKEND_URL" > .env

# Replace YOUR_BACKEND_URL with the URL from Step 1.7
# Example: https://ai-visibility-xyz.up.railway.app

# Verify the file was created
cat .env
# Should show: REACT_APP_API_URL=https://your-url...
```

### 2.3: Install Dependencies
```bash
# Install axios for API calls
npm install axios

# Should complete without errors
```

### 2.4: Create Audit Component
Create new file: `src/components/AuditForm.tsx`

```typescript
import React, { useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL;

export default function AuditForm() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);

    try {
      // Create audit
      console.log('Creating audit for:', domain);
      const auditResponse = await fetch(`${API_URL}/api/v1/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: domain,
          domain: domain,
          websiteUrl: `https://${domain}`,
          auditType: 'full'
        })
      });

      if (!auditResponse.ok) {
        throw new Error(`Failed to create audit: ${auditResponse.status}`);
      }

      const audit = await auditResponse.json();
      console.log('Audit created:', audit.id);
      const auditId = audit.id;

      // Poll for completion
      let isComplete = false;
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max

      while (!isComplete && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
        attempts++;

        const statusResponse = await fetch(`${API_URL}/api/v1/audits/${auditId}`);
        const statusData = await statusResponse.json();
        console.log(`Status check ${attempts}: ${statusData.audit.status}`);

        if (statusData.audit.status === 'completed' || statusData.audit.status === 'failed') {
          isComplete = true;
          setResults(statusData);
        }
      }

      if (!isComplete) {
        throw new Error('Audit timeout - took too long');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Error:', errorMessage);
      setError(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'system-ui' }}>
      <h1>🎯 AI Visibility Audit</h1>
      <p>Check how AI-visible your website is</p>

      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Enter domain (e.g., example.com)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontWeight: 'bold'
            }}
          >
            {loading ? '⏳ Auditing...' : '🚀 Start Audit'}
          </button>
        </div>
      </form>

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c00',
          marginBottom: '20px'
        }}>
          ❌ {error}
        </div>
      )}

      {results && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f9f9f9',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}>
          <h2>✅ Audit Complete!</h2>
          
          <div style={{ marginBottom: '20px', color: '#666' }}>
            <p>⏱️ Duration: {results.audit.durationSeconds} seconds</p>
            <p>📊 Total Signals: {results.statistics?.totalSignals}</p>
            <p>📈 Average Score: {(results.statistics?.avgScore || 0).toFixed(1)}/100</p>
          </div>

          <h3>📋 Signals Analyzed</h3>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '20px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Signal</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Score</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {results.signals?.map((signal: any) => (
                <tr key={signal.code} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>
                    <strong>{signal.name}</strong>
                    <br />
                    <small style={{ color: '#999' }}>{signal.code}</small>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <strong>{signal.score.toFixed(1)}</strong>/100
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {(signal.confidence * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {results.signals?.[0]?.evidence && (
            <details style={{ marginTop: '20px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                📊 Detailed Evidence
              </summary>
              <pre style={{
                backgroundColor: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                overflow: 'auto',
                marginTop: '10px'
              }}>
                {JSON.stringify(results.signals[0].evidence, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
```

### 2.5: Update App Component
Edit `src/App.tsx`:

```typescript
import React from 'react';
import AuditForm from './components/AuditForm';

function App() {
  return <AuditForm />;
}

export default App;
```

### 2.6: Test Locally
```bash
# Start development server
npm start

# Should open http://localhost:3000 in browser
# Try creating an audit with a test domain like "example.com"
```

**✅ Frontend is working locally!**

---

## 🚀 STEP 3: Deploy Frontend to Netlify (5 minutes)

### 3.1: Push Frontend to GitHub
```bash
# In ai-visibility-frontend directory
git init

# Add all files
git add .

# Commit
git commit -m "AI Visibility Frontend"

# Create GitHub repository
# Go to https://github.com/new
# Name it: ai-visibility-frontend
# Create it (don't initialize with README)

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-frontend.git
git branch -M main
git push -u origin main

# Verify: Check GitHub, should see your files
```

### 3.2: Connect to Netlify
1. Go to https://app.netlify.com
2. Sign up or login (can use GitHub)
3. Click "Add new site" 
4. Select "Import an existing project"
5. Choose "GitHub"
6. Authorize Netlify to access GitHub
7. Select your `ai-visibility-frontend` repository

### 3.3: Configure Build Settings
In Netlify deployment configuration:
- **Build command**: `npm run build`
- **Publish directory**: `build`
- Click "Deploy site"

Wait for build to complete (2-3 minutes)

### 3.4: Set Environment Variable in Netlify
1. In Netlify dashboard, click on your site
2. Go to "Site settings" → "Environment"
3. Click "Edit variables"
4. Add new variable:
   - **Key**: `REACT_APP_API_URL`
   - **Value**: `https://YOUR_BACKEND_URL` (from Step 1.7)
5. Save
6. Trigger redeploy by pushing new code or clicking "Trigger Deploy"

### 3.5: Get Your Frontend URL
1. In Netlify, go to "Deployments"
2. Find the green checkmark (successful deployment)
3. Copy the URL (looks like: `https://your-site-xyz.netlify.app`)
4. **Save this URL**

**✅ Frontend is live!**

---

## ✅ STEP 4: Test Everything (5 minutes)

### 4.1: Test Backend Health
```bash
# Replace with your backend URL from Step 1.7
curl https://YOUR_BACKEND_URL/health

# Should return:
# {"status":"ok","timestamp":"...","uptime":...}
```

### 4.2: Test Frontend Load
1. Open your frontend URL in browser: `https://your-site-xyz.netlify.app`
2. Should see: "🎯 AI Visibility Audit" form
3. Check browser console (F12 → Console):
   - Should show: `REACT_APP_API_URL=https://your-backend-url`
   - No errors

### 4.3: Create Test Audit
1. In frontend form, enter domain: `example.com`
2. Click "🚀 Start Audit"
3. Wait for audit to complete (30-40 seconds)
4. Should see results with signals and scores

### 4.4: Check Backend Logs
1. Go to Railway dashboard
2. Click on your web service
3. Go to "Logs" tab
4. Should see API requests from your Netlify frontend
5. No error messages

**✅ Full stack is working!**

---

## 📊 STEP 5: Monitor & Update Going Forward

### 5.1: How to Update Backend
```bash
# In ai-visibility-mvp directory
cd backend/src

# Make code changes
# ... edit files ...

# Go back to root
cd ../..

# Commit and push
git add .
git commit -m "Your changes"
git push origin main

# Railway automatically deploys (2-3 minutes)
# Check Railway dashboard for build status
```

### 5.2: How to Update Frontend
```bash
# In ai-visibility-frontend directory
# Make code changes
# ... edit files ...

# Commit and push
git add .
git commit -m "Your changes"
git push origin main

# Netlify automatically deploys (1-2 minutes)
# Check Netlify dashboard for build status
```

### 5.3: Monitor Performance
**Railway Dashboard:**
- Go to https://railway.app/dashboard
- Check "Metrics" for CPU, memory, response time
- View "Logs" for any errors
- Monitor database connections

**Netlify Dashboard:**
- Go to https://app.netlify.com
- Check "Analytics" for page loads and bandwidth
- View "Logs" for any build errors
- Check "Functions" if using functions (optional)

### 5.4: View Audit Results
**In Railway PostgreSQL:**
```bash
# Connect to your PostgreSQL database
# Using any PostgreSQL client or psql

# Query organizations
SELECT * FROM organizations;

# Query audits
SELECT * FROM audits;

# Query signals
SELECT * FROM signals;
```

---

## 🎯 SUMMARY: Your Stack is Now Live!

| Component | URL | Status |
|-----------|-----|--------|
| **Frontend** | `https://your-site-xyz.netlify.app` | ✅ Live |
| **Backend API** | `https://your-backend-xxx.up.railway.app` | ✅ Live |
| **Database** | PostgreSQL on Railway | ✅ Running |
| **Web Crawler** | Running on Railway | ✅ Ready |

---

## 📝 REFERENCE: Your URLs

**Save these somewhere:**

```
Frontend URL: https://your-site-xyz.netlify.app
Backend URL: https://your-backend-xxx.up.railway.app
GitHub Frontend: https://github.com/YOUR_USERNAME/ai-visibility-frontend
GitHub Backend: https://github.com/YOUR_USERNAME/ai-visibility-mvp
Netlify Dashboard: https://app.netlify.com
Railway Dashboard: https://railway.app
```

---

## ❓ TROUBLESHOOTING

### "Cannot connect to backend from frontend"
**Check:**
1. Is REACT_APP_API_URL set in Netlify environment?
2. Did you redeploy after setting environment variable?
3. Open browser console (F12), check for CORS errors
4. Verify backend URL is correct (no trailing slash)

**Fix:**
```bash
# In Netlify dashboard, go to Environment
# Check REACT_APP_API_URL variable
# If changed, click "Trigger Deploy"
```

### "Backend build failed on Railway"
**Check:**
1. Go to Railway → Deployments → Logs
2. Look for error messages
3. Check environment variables are set
4. Verify package.json has all dependencies

**Fix:**
```bash
# In local ai-visibility-mvp/backend
npm install  # Reinstall dependencies
npm run build  # Test build locally
git push origin main  # Push again
```

### "Frontend build failed on Netlify"
**Check:**
1. Go to Netlify → Deployments → Deploy log
2. Look for error messages
3. Check .env file exists with correct API URL
4. Verify package.json dependencies

**Fix:**
```bash
# In local ai-visibility-frontend
npm install  # Reinstall
npm run build  # Test build
npm start  # Test locally
git push origin main  # Push again
```

### "Audit takes too long / times out"
**Check:**
1. Is the website large or slow-loading?
2. Are there network issues?
3. Check Railway logs for errors

**Fix:**
1. Try with a simpler domain (example.com)
2. Increase CRAWL_TIMEOUT_MS in backend environment
3. Reduce MAX_PAGES_PER_AUDIT

---

## 🎉 YOU'RE DONE!

Your AI Visibility MVP is now running on professional, production-ready hosting!

**Next steps:**
1. Share the frontend URL with others
2. Monitor performance in both dashboards
3. Add more signals and features
4. Scale as needed

**Happy deploying!** 🚀
