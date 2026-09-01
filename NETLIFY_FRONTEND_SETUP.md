# AI Visibility MVP + Netlify - Best Practice Guide

Netlify is great for **frontend hosting**, but there's an important consideration for this MVP backend.

---

## ⚠️ Important: Netlify Limitations for This Backend

Netlify has two main offerings:

### **1. Static Site Hosting**
- ✅ Perfect for: HTML, CSS, JavaScript frontends
- ❌ Not for: Node.js backend servers
- Reason: No persistent Node.js runtime

### **2. Netlify Functions** (Serverless)
- ✅ Good for: Simple API endpoints
- ❌ Not ideal for: Web crawlers, long-running processes
- Reason: 
  - Max 10 second execution time (too short for crawling)
  - Max 3 GB memory (crawler needs more for large sites)
  - Stateless (each request is isolated)

---

## 🎯 The Best Architecture

### **What Netlify SHOULD Host**
- ✅ Frontend React/Vue app (your UI)
- ✅ Static assets (images, CSS)
- ✅ Basic API calls to backend

### **What Should Run Elsewhere**
- ✅ Node.js backend (crawler, signals, API)
- ✅ PostgreSQL database
- ✅ Redis cache

---

## 📋 Three Deployment Architectures

### **ARCHITECTURE 1: Frontend on Netlify + Backend on Railway** ⭐ RECOMMENDED

```
┌──────────────────┐
│  Netlify         │
│  (Frontend)      │  User visits: https://your-site.netlify.app
│  - React app     │  
│  - UI            │
└────────┬─────────┘
         │ API calls to
         │
         v
┌──────────────────┐
│  Railway         │
│  (Backend)       │  API at: https://your-backend-xxx.up.railway.app
│  - Express API   │  
│  - Postgres DB   │  
│  - Web crawler   │  
│  - Signals       │  
└──────────────────┘
```

**This is what you should do!**

---

### **ARCHITECTURE 2: Everything on Railway (Simpler)**

```
┌──────────────────┐
│  Railway         │
│  - React app     │  https://your-app-xxx.up.railway.app
│  - Backend API   │  
│  - Database      │  
│  - Crawler       │  
└──────────────────┘
```

**Simplest option - no Netlify needed**

---

### **ARCHITECTURE 3: Frontend on Netlify + Netlify Functions + External DB**

```
┌──────────────────┐
│  Netlify         │
│  - React app     │  Frontend: https://your-site.netlify.app
│  - Functions     │  API functions (limited)
└────────┬─────────┘
         │
         v
┌──────────────────┐
│  External        │
│  - Postgres      │  Database hosted separately
│  - Redis         │  
└──────────────────┘
```

**Possible but complex & limited by function timeout**

---

## ✅ RECOMMENDATION: Option 1 - Netlify + Railway

### **Why This is Best**
- Frontend is fast (Netlify CDN)
- Backend has full power (Railway)
- Clear separation of concerns
- Easy to scale independently
- Good for MVP → Production

### **Setup Steps**

#### **Part 1: Deploy Backend on Railway** (Already covered)

Follow: `RAILWAY_DEPLOYMENT.md`

Your backend URL: `https://your-backend-xxx.up.railway.app`

#### **Part 2: Create React Frontend**

```bash
# Create React app
npx create-react-app ai-visibility-frontend
cd ai-visibility-frontend

# Install dependencies
npm install axios

# Create .env file
echo "REACT_APP_API_URL=https://your-backend-xxx.up.railway.app" > .env
```

#### **Part 3: Example Frontend Code**

Create `src/AuditForm.tsx`:

```typescript
import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

export default function AuditForm() {
  const [organizationName, setOrganizationName] = useState('');
  const [domain, setDomain] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create audit
      const auditResponse = await axios.post(`${API_URL}/api/v1/audits`, {
        organizationName,
        domain,
        websiteUrl,
      });

      const auditId = auditResponse.data.id;

      // Wait for completion (poll every 5 seconds)
      let audit = auditResponse.data;
      while (audit.status === 'queued' || audit.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const resultResponse = await axios.get(
          `${API_URL}/api/v1/audits/${auditId}`
        );
        audit = resultResponse.data.audit;
      }

      // Get final results with signals
      const finalResponse = await axios.get(
        `${API_URL}/api/v1/audits/${auditId}`
      );
      setResults(finalResponse.data);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create audit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', padding: '20px' }}>
      <h1>AI Visibility Audit</h1>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label>Organization Name:</label>
          <input
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Domain:</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Website URL:</label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            required
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Running Audit...' : 'Start Audit'}
        </button>
      </form>

      {results && (
        <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #ccc' }}>
          <h2>Audit Results</h2>
          <p><strong>Status:</strong> {results.audit.status}</p>
          <p><strong>Duration:</strong> {results.audit.durationSeconds} seconds</p>
          
          <h3>Signals</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Signal</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {results.signals.map((signal: any) => (
                <tr key={signal.code} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{signal.name}</td>
                  <td style={{ padding: '10px' }}>{signal.score.toFixed(2)}/100</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

#### **Part 4: Deploy Frontend to Netlify**

```bash
# Build React app
npm run build

# Then deploy to Netlify

# Option A: Netlify CLI
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=build

# Option B: Git + Netlify
# 1. Push to GitHub
# 2. Sign up: https://app.netlify.com/
# 3. Connect GitHub repo
# 4. Build command: npm run build
# 5. Publish directory: build
# 6. Deploy
```

#### **Part 5: Set Environment Variable in Netlify**

1. Go to https://app.netlify.com/
2. Select your site
3. Go to Settings → Environment
4. Add variable:
   ```
   REACT_APP_API_URL=https://your-backend-xxx.up.railway.app
   ```

---

## 🚀 Quick Setup Summary

### **Backend (Railway)**
- Done! Already deployed
- URL: `https://your-backend-xxx.up.railway.app`

### **Frontend (Netlify)**
1. Create React app: `npx create-react-app ai-visibility-frontend`
2. Add frontend code (see example above)
3. Push to GitHub
4. Connect to Netlify
5. Set environment variables
6. Deploy!

Your full app: `https://your-site.netlify.app`

---

## ⚡ If You Really Want Everything on Netlify

### **Using Netlify Functions** (Limited)

You COULD create serverless functions, but:

**Problems:**
- Max 10 second timeout (crawling needs 30+ seconds)
- Max 3 GB memory (crawler needs more)
- No persistent state
- No good for long-running processes

**What works:**
- Simple API proxies
- Data transformation
- Basic CRUD operations

**Not recommended for this MVP because:**
- Web crawling takes too long
- Signal computation is heavy
- Better solutions exist (Railway)

---

## 📊 Recommended Solution Comparison

| Component | Netlify | Railway | Best For |
|-----------|---------|---------|----------|
| **Frontend** | ✅ Excellent | ✅ Good | Netlify |
| **Backend API** | ⚠️ Functions limited | ✅ Perfect | Railway |
| **Database** | ❌ No | ✅ Yes | Railway |
| **Web Crawler** | ❌ No (timeout) | ✅ Yes | Railway |
| **CDN Speed** | ✅ Best | ✅ Good | Netlify |

**Recommendation:** Frontend on Netlify + Backend on Railway

---

## 🔄 Full Workflow After Setup

1. **Make changes to backend**
   ```bash
   cd ai-visibility-mvp/backend
   # Edit code
   git push origin main
   # Railway auto-deploys
   ```

2. **Make changes to frontend**
   ```bash
   cd ai-visibility-frontend
   # Edit code
   git push origin main
   # Netlify auto-deploys
   ```

3. **Both are live automatically!**
   - Frontend: `https://your-site.netlify.app`
   - Backend: `https://your-backend-xxx.up.railway.app`

---

## 💡 If You Prefer All-in-One

If you want everything simpler without Netlify, just use:

**Option A: Railway (Simplest)**
- Deploy both frontend and backend
- PostgreSQL included
- Everything managed
- No Netlify needed

**Option B: Docker**
- One container for everything
- Deploy anywhere
- Full control

**Option C: Traditional VPS**
- DigitalOcean droplet
- Full control
- Most learning

---

## ✅ My Final Recommendation

### **Deploy Like This:**

1. **Backend on Railway** (Already done)
   - URL: `https://your-backend-xxx.up.railway.app`
   - Time: Done

2. **Frontend on Netlify** (New)
   - Create React app
   - Add UI (15 minutes)
   - Push to GitHub
   - Connect to Netlify
   - Deploy automatically

**Result:**
- 🌐 Frontend: `https://your-site.netlify.app`
- 🔧 Backend: `https://your-backend-xxx.up.railway.app`
- 📊 Both production-ready
- 🚀 Both auto-deploy on git push

---

## 📚 Next Steps

### **If You Want to Use Netlify for Frontend:**

1. Create React frontend (15 min)
2. Connect to your Railway backend API
3. Push to GitHub
4. Deploy on Netlify (2 min)
5. Done!

### **If You Want to Skip Netlify:**

Just use Railway for everything (simpler)

### **Files You Need**

- `ai-visibility-mvp/backend/` - Already deployed on Railway
- Create new folder for `ai-visibility-frontend/` - Deploy on Netlify

---

## 🎯 Decision Tree

```
Do you want to use Netlify?
├─ YES, for frontend only
│  └─ Use Netlify for React app
│  └─ Backend stays on Railway
│  └─ This is the best approach ✅
│
├─ YES, for everything
│  └─ Use Netlify Functions
│  └─ Not ideal for crawlers
│  └─ 10 second timeout is too short
│  └─ Not recommended ❌
│
└─ NO, use Railway for everything
   └─ Simpler setup
   └─ One platform
   └─ Works great ✅
```

---

## 🚀 Start Building Frontend!

```bash
# Create frontend
npx create-react-app ai-visibility-frontend
cd ai-visibility-frontend

# Install axios for API calls
npm install axios

# Create .env with your backend URL
echo "REACT_APP_API_URL=https://your-backend-xxx.up.railway.app" > .env

# Push to GitHub
git init && git add . && git commit -m "AI Visibility Frontend"
git push origin main

# Deploy on Netlify
# Go to https://app.netlify.com/
# Connect GitHub
# Done! 🎉
```

---

## 📞 Summary

**Netlify is great for frontend, but not ideal for Node.js backends.**

**Best approach:**
1. Frontend on Netlify (static + React)
2. Backend on Railway (Node.js + Database)
3. Both auto-deploy from GitHub

This gives you the best of both worlds! ✨
