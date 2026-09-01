# Netlify + Railway: Complete Stack Setup

## ⚡ The Short Answer

**Netlify is for frontend, Railway is for backend.**

```
User's Browser
      ↓
Netlify (Frontend UI)
      ↓ calls API
Railway (Backend + Database)
```

---

## 🎯 What You Can Do

### ✅ **Deploy Backend on Railway** (Already Done!)
- API running at: `https://your-backend-xxx.up.railway.app`
- Can crawl websites, compute signals, store data
- Fully functional

### ✅ **Deploy Frontend on Netlify** (New!)
- React UI at: `https://your-site.netlify.app`
- Users interact with this
- Calls your Railway API

### ❌ **DON'T Deploy Backend on Netlify** (Won't Work Well)
- Netlify Functions have 10 second timeout
- Your crawler needs 30+ seconds
- Netlify is not designed for persistent backends
- Use Railway instead

---

## 📋 Why This Architecture?

| Part | Platform | Why |
|------|----------|-----|
| **Frontend (React)** | Netlify | ✅ Fast CDN, easy deploy, perfect for static/SPAs |
| **Backend (Node.js)** | Railway | ✅ Full runtime, no timeouts, persistent connections |
| **Database** | Railway | ✅ PostgreSQL fully supported, automatic backups |
| **Crawler** | Railway | ✅ Needs 30+ seconds, Netlify max is 10 seconds |

---

## 🚀 3-Step Setup

### **Step 1: Backend** ✅ (Already Done)
```
Deployed on Railway
URL: https://your-backend-xxx.up.railway.app
API ready to receive requests
```

### **Step 2: Create Frontend** (10 minutes)
```bash
npx create-react-app ai-visibility-frontend
cd ai-visibility-frontend

# Set backend API URL
echo "REACT_APP_API_URL=https://your-backend-xxx.up.railway.app" > .env

# Install HTTP client
npm install axios
```

### **Step 3: Deploy Frontend** (5 minutes)
```bash
# Push to GitHub
git init && git add . && git commit -m "Frontend"
git push origin main

# On Netlify:
# 1. Connect GitHub
# 2. Deploy
# 3. Done!
```

---

## 💻 Frontend Code Example

### **Create `src/components/AuditForm.tsx`**

```typescript
import { useState } from 'react';

export default function AuditForm() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleAudit = async () => {
    setLoading(true);
    try {
      // Call your Railway backend
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/v1/audits`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName: domain,
            domain,
            websiteUrl: `https://${domain}`
          })
        }
      );

      const audit = await response.json();

      // Wait for completion
      let status = 'queued';
      while (status !== 'completed' && status !== 'failed') {
        await new Promise(r => setTimeout(r, 3000));
        const statusResp = await fetch(
          `${process.env.REACT_APP_API_URL}/api/v1/audits/${audit.id}`
        );
        const statusData = await statusResp.json();
        status = statusData.audit.status;
      }

      // Get final results
      const resultsResp = await fetch(
        `${process.env.REACT_APP_API_URL}/api/v1/audits/${audit.id}`
      );
      setResults(await resultsResp.json());
    } catch (error) {
      console.error('Error:', error);
      alert('Audit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>🎯 AI Visibility Check</h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="domain.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          style={{ flex: 1, padding: '10px', fontSize: '16px' }}
        />
        <button
          onClick={handleAudit}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          {loading ? 'Checking...' : 'Check'}
        </button>
      </div>

      {results && (
        <div style={{ border: '1px solid #ddd', padding: '15px' }}>
          <h2>Results</h2>
          {results.signals?.map((signal: any) => (
            <div key={signal.code} style={{ marginBottom: '10px' }}>
              <p><strong>{signal.name}</strong></p>
              <p>Score: {signal.score.toFixed(1)}/100</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 📍 Environment Variables

### **Netlify**
Set in Netlify dashboard:
```
REACT_APP_API_URL=https://your-backend-xxx.up.railway.app
```

### **Railway** (Already Set)
```
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

---

## 🎯 Files You Need

### **Already Have (Backend)**
```
ai-visibility-mvp/
├── backend/          ← Deployed on Railway
├── docker-compose.yml
└── ...
```

### **Need to Create (Frontend)**
```
ai-visibility-frontend/    ← Deploy on Netlify
├── src/
│   ├── components/
│   │   └── AuditForm.tsx
│   ├── App.tsx
│   └── index.tsx
├── package.json
└── .env
```

### **Deployment**
```
GitHub
├── ai-visibility-mvp           → Railway (auto-deploy)
└── ai-visibility-frontend      → Netlify (auto-deploy)
```

---

## 🚀 Complete Deployment Checklist

- [ ] Backend on Railway ✅ (done)
- [ ] Frontend created locally (npx create-react-app)
- [ ] Frontend code added (AuditForm component)
- [ ] .env file with API_URL created
- [ ] Code pushed to GitHub
- [ ] Connected to Netlify
- [ ] Environment variable set in Netlify
- [ ] Site deployed on Netlify
- [ ] Test: Visit https://your-site.netlify.app
- [ ] Test: Create audit
- [ ] Check Railway logs to see audit running
- [ ] See results on Netlify frontend

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    INTERNET (PUBLIC)                    │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────┐    ┌─────────────────────────┐
│    NETLIFY              │    │      RAILWAY            │
│  (Frontend Hosting)     │    │  (Backend Service)      │
│                         │    │                         │
│  React App              │    │  Node.js/Express        │
│  https://your-site....  │    │  PostgreSQL             │
│                         │    │  Redis                  │
│  User clicks button → ──┼───→│  Web Crawler            │
│  ← Returns results ──── │    │  Signal Engine          │
│                         │    │  https://your-backend...│
└──────────────────────────┘    └─────────────────────────┘

           Frontend                    Backend
        (What users see)          (Where work happens)
```

---

## ⚡ Quick Reference

### **To Update Backend**
```bash
cd ai-visibility-mvp/backend
# Make changes
git push origin main
# Railway automatically deploys (2 min)
```

### **To Update Frontend**
```bash
cd ai-visibility-frontend
# Make changes
git push origin main
# Netlify automatically deploys (2 min)
```

### **To Test**
```bash
# Visit your site
https://your-site.netlify.app

# In browser console, check:
console.log(process.env.REACT_APP_API_URL)
// Should show your Railway API URL

# Try creating an audit
```

---

## 🎓 Netlify Alternatives for Frontend

If you prefer not to use Netlify:

| Platform | Best For | Setup |
|----------|----------|-------|
| **Vercel** | Next.js | 5 min |
| **GitHub Pages** | Static sites | 5 min |
| **Railway** | Everything | 10 min |
| **Render** | Full stack | 10 min |

**Railway is simplest** if you want everything on one platform.

---

## 🚫 Why NOT to Deploy Backend on Netlify

Netlify Functions would have these issues:

❌ **10 second timeout**
- Your crawler needs 30+ seconds
- Won't finish audits

❌ **3 GB memory limit**
- Crawler needs more for large sites
- Heavy signals fail

❌ **Stateless**
- Each request is isolated
- Can't maintain database connections

❌ **Cold starts**
- First request takes 5-10 seconds
- Bad user experience

✅ **Railway doesn't have these problems**

---

## 💡 Best Practices

### **Do**
✅ Frontend on Netlify or Vercel
✅ Backend on Railway, AWS, or GCP
✅ Use environment variables for API URL
✅ Set up error handling in frontend
✅ Monitor both deployments

### **Don't**
❌ Backend on Netlify Functions
❌ Hardcode backend URL in code
❌ Use old/deprecated APIs
❌ Skip environment variable setup
❌ Deploy without testing

---

## 🆘 Troubleshooting

### **Frontend can't reach backend**
```javascript
// In browser console:
fetch(process.env.REACT_APP_API_URL + '/health')
  .then(r => r.json())
  .then(console.log)
  
// If error: Check API_URL env variable
```

### **Audit times out**
- Check Railway backend logs
- Make sure crawler is running
- Increase timeout in frontend

### **Netlify build fails**
- Check build logs in Netlify dashboard
- Verify npm dependencies
- Make sure .env file exists

### **API returns 500 error**
- Check Railway logs
- Verify database connection
- Check environment variables

---

## 🎉 You're Ready!

With **Netlify for frontend + Railway for backend**, you have:

✅ Professional hosting
✅ Auto-deploy on git push
✅ Full feature support
✅ Scalable architecture
✅ Production-ready
✅ $20-50/month cost

---

## 📚 Files to Read

1. **NETLIFY_QUICK_SETUP.md** - Fast setup guide
2. **NETLIFY_FRONTEND_SETUP.md** - Detailed setup
3. **RAILWAY_DEPLOYMENT.md** - Backend setup (already done)
4. **CLOUD_DEPLOYMENT_GUIDE.md** - All platform options

---

## 🚀 Start Now!

```bash
# Create frontend
npx create-react-app ai-visibility-frontend

# Set backend URL
cd ai-visibility-frontend
echo "REACT_APP_API_URL=https://your-backend-xxx.up.railway.app" > .env

# Push to GitHub
git init && git add . && git commit -m "Frontend"
git push origin main

# Deploy on Netlify
# Go to netlify.com and connect your repo

# Done! 🎉
```

---

**Questions?** Check the detailed guides above.
**Ready?** Start building your frontend! 🚀
