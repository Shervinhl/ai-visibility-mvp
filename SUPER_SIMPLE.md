# SUPER SIMPLE - Just Do This

**Don't overthink it. Just follow these 5 things.**

---

## Option 1: EASIEST WAY (RECOMMENDED) ⭐

**Use Railway for EVERYTHING. Don't use Netlify.**

Why? Railway does both frontend AND backend. One place. Simple.

---

## SUPER SIMPLE STEPS (20 minutes)

### Step 1: Push your code to GitHub
```bash
cd ai-visibility-mvp
git init
git add .
git commit -m "first"
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git
git branch -M main
git push -u origin main
```

**Done.** Your code is on GitHub now.

---

### Step 2: Go to Railway and click "New Project"

1. Go to https://railway.app
2. Click "Start New Project"
3. Click "Deploy from GitHub"  
4. Pick your ai-visibility-mvp project
5. Wait 5 minutes while it builds

**Done.** Your backend is live.

---

### Step 3: Railway adds a database automatically

It's already added. No action needed.

**Done.** Database is ready.

---

### Step 4: You're Done! 

Your API is at: `https://your-project-xxx.up.railway.app`

Test it:
```bash
curl https://your-project-xxx.up.railway.app/health
```

Should see: `{"status":"ok"}`

---

## Want a Frontend?

If you want a UI (optional):

### Make a React app
```bash
cd ..
npx create-react-app frontend
cd frontend
echo "REACT_APP_API_URL=https://your-project-xxx.up.railway.app" > .env
npm install axios
```

### Add this file: `src/App.tsx`
```typescript
import { useState } from 'react';

export default function App() {
  const [domain, setDomain] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const audit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: domain,
          domain,
          websiteUrl: `https://${domain}`
        })
      });
      const audit = await res.json();
      
      // Wait for it to finish
      let done = false;
      while (!done) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/audits/${audit.id}`);
        const data = await check.json();
        if (data.audit.status === 'completed') {
          setResults(data);
          done = true;
        }
      }
    } catch (e) {
      alert('Error: ' + e);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>AI Audit Check</h1>
      <input
        value={domain}
        onChange={e => setDomain(e.target.value)}
        placeholder="example.com"
        style={{ width: '100%', padding: '10px', fontSize: '16px' }}
      />
      <button
        onClick={audit}
        disabled={loading}
        style={{ padding: '10px 20px', marginTop: '10px', cursor: 'pointer' }}
      >
        {loading ? 'Checking...' : 'Check Domain'}
      </button>
      
      {results && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc' }}>
          <h2>Results:</h2>
          {results.signals?.map((s) => (
            <div key={s.code}>
              <p><strong>{s.name}:</strong> {s.score}/100</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Test it
```bash
npm start
```

Open http://localhost:3000. Try entering "example.com". Wait 30 seconds. See results.

### Deploy frontend
```bash
git init
git add .
git commit -m "frontend"
git remote add origin https://github.com/YOUR_USERNAME/frontend.git
git branch -M main
git push -u origin main
```

Then go to https://netlify.com:
1. Sign up
2. Click "Add new site"
3. Select your frontend repo
4. It deploys automatically
5. Done

---

## THAT'S IT

You now have:
- Backend: https://your-railway-app.up.railway.app
- Frontend: https://your-netlify-app.netlify.app (if you made it)

**Both are live and working.**

---

## To Update Code Later

Backend:
```bash
cd ai-visibility-mvp
# make changes
git add .
git commit -m "update"
git push
# Railway auto-deploys
```

Frontend:
```bash
cd frontend
# make changes
git add .
git commit -m "update"  
git push
# Netlify auto-deploys
```

---

## That's all. No more reading needed.

Just do those 4 steps above and you're done.

Questions? They're probably answered in the other detailed guides.

Good luck! 🚀
