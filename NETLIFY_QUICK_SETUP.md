# Netlify + Railway Setup - Quick Visual Guide

## 🎯 The Best Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                        │
└────────┬────────────────────────────────────────────────┘
         │ visits https://your-site.netlify.app
         │
         v
┌──────────────────────────────────────────────────────────┐
│              NETLIFY (Frontend Hosting)                  │
│                                                          │
│  ✅ React App (your UI)                                │
│  ✅ HTML, CSS, JavaScript                              │
│  ✅ Hosted on CDN (fast)                               │
│  ✅ Auto-deploy from GitHub                            │
│  ✅ Free HTTPS                                          │
│                                                          │
│  Your URL: https://your-site.netlify.app               │
└────────┬────────────────────────────────────────────────┘
         │ API calls to https://your-backend-xxx.up.railway.app
         │
         v
┌──────────────────────────────────────────────────────────┐
│              RAILWAY (Backend Service)                   │
│                                                          │
│  ✅ Node.js/Express API                                │
│  ✅ Web crawler (Playwright)                           │
│  ✅ PostgreSQL database                                │
│  ✅ Redis cache                                         │
│  ✅ Signal computation                                  │
│  ✅ Auto-deploy from GitHub                            │
│                                                          │
│  Your URL: https://your-backend-xxx.up.railway.app     │
└──────────────────────────────────────────────────────────┘
```

---

## ⚡ Setup in 20 Minutes

### **Step 1: Backend Already Done! ✅**
- Railway deployment: Done
- API running: `https://your-backend-xxx.up.railway.app`
- Next: Build frontend

### **Step 2: Create Frontend (5 minutes)**

```bash
# Create React app
npx create-react-app ai-visibility-frontend
cd ai-visibility-frontend

# Create environment file
echo "REACT_APP_API_URL=https://your-backend-xxx.up.railway.app" > .env

# Install API client
npm install axios
```

### **Step 3: Add Frontend Code (5 minutes)**

Create `src/pages/Audit.tsx`:

```typescript
import { useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL;

export default function Audit() {
  const [domain, setDomain] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Create audit
      const response = await fetch(`${API_URL}/api/v1/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: domain,
          domain: domain,
          websiteUrl: `https://${domain}`,
          auditType: 'full'
        })
      });

      const audit = await response.json();
      const auditId = audit.id;

      // Poll for completion
      let status = 'queued';
      while (status === 'queued' || status === 'running') {
        await new Promise(r => setTimeout(r, 3000));
        const statusResponse = await fetch(`${API_URL}/api/v1/audits/${auditId}`);
        const data = await statusResponse.json();
        status = data.audit.status;
      }

      // Get results
      const resultsResponse = await fetch(`${API_URL}/api/v1/audits/${auditId}`);
      const resultsData = await resultsResponse.json();
      setResults(resultsData);
    } catch (err) {
      setError('Failed to create audit: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'system-ui' }}>
      <h1>🎯 AI Visibility Audit</h1>
      <p>Check your website's AI readiness</p>

      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Enter domain (e.g., example.com)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
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
          color: '#c33',
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
          <p>⏱️ Duration: {results.audit.durationSeconds} seconds</p>

          <h3>📊 Signals</h3>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '15px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Signal</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Score</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {results.signals?.map((signal: any) => (
                <tr key={signal.code} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>
                    <strong>{signal.name}</strong>
                    <br />
                    <small style={{ color: '#666' }}>{signal.code} ({signal.type})</small>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <strong>{signal.score.toFixed(1)}</strong>/100
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    {(signal.confidence * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: '20px' }}>📈 Statistics</h3>
          <p>Total Signals: {results.statistics?.totalSignals}</p>
          <p>Average Score: {parseFloat(results.statistics?.avgScore || 0).toFixed(1)}/100</p>
          <p>Average Confidence: {parseFloat(results.statistics?.avgConfidence || 0).toFixed(1)}</p>
        </div>
      )}
    </div>
  );
}
```

### **Step 4: Push to GitHub (2 minutes)**

```bash
cd ai-visibility-frontend
git init
git add .
git commit -m "AI Visibility Frontend"
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-frontend
git push -u origin main
```

### **Step 5: Deploy on Netlify (5 minutes)**

1. Go to https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Select GitHub
4. Choose `ai-visibility-frontend` repository
5. Configure:
   - Build command: `npm run build`
   - Publish directory: `build`
   - Click "Deploy"

### **Step 6: Set Environment Variable (1 minute)**

1. In Netlify dashboard, click your site
2. Go to Settings → Environment
3. Add new variable:
   - Key: `REACT_APP_API_URL`
   - Value: `https://your-backend-xxx.up.railway.app`
4. Redeploy site

---

## 🎉 You're Done!

### **Your Full Stack is Live:**

```
Frontend:  https://your-site.netlify.app
Backend:   https://your-backend-xxx.up.railway.app
```

### **What You Have:**
- ✅ Frontend UI hosted on Netlify CDN
- ✅ Backend API running on Railway
- ✅ Database in PostgreSQL
- ✅ Web crawler running
- ✅ Signals computing
- ✅ Both auto-deploy from GitHub

---

## 🔄 Update Workflow

### **Update Frontend**
```bash
cd ai-visibility-frontend
# Edit code
git add .
git commit -m "Your changes"
git push origin main
# Netlify automatically deploys (2 min)
```

### **Update Backend**
```bash
cd ai-visibility-mvp/backend
# Edit code
git add .
git commit -m "Your changes"
git push origin main
# Railway automatically deploys (2 min)
```

Both are live automatically!

---

## 📊 Comparison: Netlify vs Other Options

| Feature | Netlify Only | Netlify + Railway ⭐ | Railway Only |
|---------|--------------|-------------------|------------|
| Frontend | ✅ Best | ✅ Best | ✅ Good |
| Backend | ❌ Functions limited | ✅ Full power | ✅ Full power |
| Web Crawler | ❌ No (timeout) | ✅ Yes | ✅ Yes |
| Database | ❌ No | ✅ Yes | ✅ Yes |
| Cost | $0-50/mo | $20-50/mo | $20-50/mo |
| Setup | Complex | Easy ✅ | Simplest |
| Best for | MVP | MVP ✅ | Production |

---

## 💡 Why This Architecture is Best

1. **Separation of Concerns**
   - Netlify for what it's best at (frontend)
   - Railway for what it's best at (backend)

2. **Performance**
   - Frontend cached on Netlify CDN (fast)
   - Backend with full computing power

3. **Scalability**
   - Scale each independently
   - Frontend never blocks backend

4. **Cost Efficient**
   - Frontend hosting is cheap on Netlify
   - Backend has what it needs on Railway

5. **Developer Experience**
   - Push code → auto-deploy
   - No manual deployment steps

---

## 🚀 Alternative: Everything on Railway

If you prefer one platform:

```bash
# Backend already on Railway
# Add frontend to same project

# In Railway, create new service for frontend
# Deploy React build there
# URL: https://your-app-xxx.up.railway.app

# Done! Everything on one platform
```

**Simpler but loses Netlify's CDN optimization**

---

## 📚 Complete File Checklist

After following this guide, you should have:

```
ai-visibility-frontend/          (New - on GitHub)
├── public/
├── src/
│   ├── pages/
│   │   └── Audit.tsx            (Example provided)
│   ├── App.tsx
│   └── index.tsx
├── package.json
├── .env                         (With API URL)
└── .gitignore

ai-visibility-mvp/               (Already deployed)
├── backend/
│   ├── src/
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml           (for local dev)

Deployed:
├── Frontend: https://your-site.netlify.app
└── Backend:  https://your-backend-xxx.up.railway.app
```

---

## ✅ Final Checklist

- [ ] Backend deployed on Railway ✅ (done)
- [ ] Frontend created with React (15 min)
- [ ] Environment variable set (.env)
- [ ] Code pushed to GitHub
- [ ] Connected to Netlify
- [ ] Netlify environment variable set
- [ ] Both sites deployed and live
- [ ] Test audit creation works
- [ ] Frontend shows results

---

## 🎓 Summary

**Netlify**: Frontend hosting (best in class)
**Railway**: Backend hosting (full power for crawlers)
**Together**: Perfect production architecture

**Setup time**: 20 minutes total
**Cost**: $20-50/month
**Result**: Production-ready MVP

---

Ready to build? Start with the frontend code above! 🚀
