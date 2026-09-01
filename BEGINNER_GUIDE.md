# BEGINNER GUIDE - Never Used GitHub Before

**Read this. Follow EXACTLY. Don't skip anything.**

---

## PART 1: CREATE GITHUB ACCOUNT (2 minutes)

### Step 1: Go to GitHub
Open your web browser and go to:
```
https://github.com
```

### Step 2: Click "Sign up"
Look in the top right corner. Click the "Sign up" button.

### Step 3: Enter Your Email
- Email: use your email address
- Password: create a password you remember
- Username: anything you want (example: `shervin2024`)
- Click "Create account"

### Step 4: Verify Email
Check your email inbox. GitHub sent you a verification email.
Click the link in that email.

**✅ You now have a GitHub account!**

Save this information:
```
Username: ___________________
Password: ___________________
Email: ___________________
```

---

## PART 2: UPLOAD YOUR CODE (5 minutes)

### Step 1: Go to GitHub
Go to https://github.com and login with your username/password.

### Step 2: Create a New Repository
Look in the top right corner. Click the "+" icon. 
Click "New repository".

### Step 3: Fill Out the Form

**Repository name:** `ai-visibility-mvp`
(Copy this exactly)

**Description:** (optional - can leave blank)

**Public or Private:** Choose "Public"

Scroll down and click "Create repository"

### Step 4: You See Instructions
GitHub will show you some instructions. 

**IGNORE all of that.**

Instead, open your terminal and do this:

---

## PART 3: OPEN TERMINAL (1 minute)

### On Mac:
- Press: `Command + Space`
- Type: `terminal`
- Press: `Enter`

### On Windows:
- Press: `Windows Key`
- Type: `cmd`
- Press: `Enter`

### On Linux:
- Open: Terminal (should be in your applications)

**✅ You should now see a black window with text.**

This is your Terminal. That's where we'll type commands.

---

## PART 4: PUSH YOUR CODE (5 minutes)

### Step 1: Navigate to Your Project
In the terminal, type this command (copy exactly):

```bash
cd ai-visibility-mvp
```

Press Enter.

### Step 2: Initialize Git
Type this command:

```bash
git init
```

Press Enter.

### Step 3: Add All Your Files
Type this command:

```bash
git add .
```

Press Enter.

### Step 4: Create First Commit
Type this command:

```bash
git commit -m "my first commit"
```

Press Enter.

### Step 5: Connect to GitHub
Type this command (replace YOUR_USERNAME with your GitHub username from Step 1):

```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-mvp.git
```

Example: If your username is `shervin2024`, it would be:
```bash
git remote add origin https://github.com/shervin2024/ai-visibility-mvp.git
```

Press Enter.

### Step 6: Push to GitHub
Type this command:

```bash
git branch -M main
```

Press Enter.

Then type:

```bash
git push -u origin main
```

Press Enter.

**It will ask for your GitHub username and password.**
- Username: type your GitHub username
- Password: type your GitHub password (it won't show characters - that's normal)

Press Enter.

### Step 7: Wait
It will say "Counting objects..." and "Compressing objects..."

Wait 30 seconds. 

When it finishes, you should see:
```
To https://github.com/YOUR_USERNAME/ai-visibility-mvp.git
 * [new branch]      main -> main
```

**✅ Your code is now on GitHub!**

---

## PART 5: VERIFY ON GITHUB (1 minute)

### Step 1: Go to GitHub Website
In your browser, go to:
```
https://github.com/YOUR_USERNAME/ai-visibility-mvp
```

Replace YOUR_USERNAME with your actual GitHub username.

### Step 2: Check Your Files
You should see:
- backend/
- docker-compose.yml
- .env.example
- And other files

If you see these, **you're good!**

---

## PART 6: DEPLOY ON RAILWAY (5 minutes)

### Step 1: Go to Railway
Open your web browser and go to:
```
https://railway.app
```

### Step 2: Sign Up
Click "Start New Project"

### Step 3: Choose GitHub
Click "Deploy from GitHub"

A popup will appear asking to connect GitHub.
Click "Connect GitHub"

GitHub will ask to authorize Railway.
Click "Authorize" and "Confirm"

### Step 4: Select Your Repository
A list of your repos will appear.
Click on: `ai-visibility-mvp`

### Step 5: Wait for Deploy
Railway will automatically:
- Build your project (5 minutes)
- Deploy it
- Add a database

You'll see a green checkmark when done.

### Step 6: Get Your URL
In Railway, look for "Deployments" section.

Find "Domains" - you'll see a URL like:
```
https://ai-visibility-xyz123.up.railway.app
```

**SAVE THIS URL!**

---

## PART 7: TEST IT WORKS (2 minutes)

### Step 1: Copy Your URL
Copy the URL from Step 6 above.

### Step 2: Open Terminal Again
Open a new terminal window.

### Step 3: Test the API
Type this command (replace YOUR_URL with your actual URL):

```bash
curl https://YOUR_URL/health
```

Example:
```bash
curl https://ai-visibility-xyz123.up.railway.app/health
```

Press Enter.

### Step 4: Check Response
You should see:
```
{"status":"ok","timestamp":"2024-09-01T...","uptime":123}
```

**✅ If you see this, your backend is working!**

---

## THAT'S ALL!

Your backend is now live at:
```
https://YOUR_URL/health
```

You can:
1. Take a break
2. Make a frontend (optional - see below)
3. Or you're done!

---

## OPTIONAL: MAKE A SIMPLE FRONTEND

If you want a UI to go with it:

### Step 1: Create React App
In terminal, go to parent directory:

```bash
cd ..
```

Then create React:

```bash
npx create-react-app frontend
```

Wait 3 minutes.

### Step 2: Set API URL
Navigate to frontend:

```bash
cd frontend
```

Create .env file:

```bash
echo "REACT_APP_API_URL=https://YOUR_URL" > .env
```

Replace YOUR_URL with your Railway URL.

### Step 3: Install HTTP Library
```bash
npm install axios
```

### Step 4: Edit App
Open `src/App.tsx` in your text editor.

Delete everything and paste this:

```typescript
import { useState } from 'react';

export default function App() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      
      let completed = false;
      while (!completed) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/audits/${audit.id}`);
        const data = await check.json();
        if (data.audit.status === 'completed') {
          setResults(data);
          completed = true;
        }
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>🎯 AI Visibility Check</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="example.com"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          style={{ width: '100%', padding: '10px', fontSize: '16px' }}
          required
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            marginTop: '10px',
            fontSize: '16px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Checking...' : 'Check Domain'}
        </button>
      </form>

      {results && (
        <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #ccc' }}>
          <h2>Results</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Signal</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {results.signals?.map((signal) => (
                <tr key={signal.code} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{signal.name}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {signal.score.toFixed(1)}/100
                  </td>
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

Save the file.

### Step 5: Test Locally
In terminal:

```bash
npm start
```

A browser window should open at `http://localhost:3000`

Try entering "example.com" and clicking the button.

Wait 30 seconds. You should see results!

Press Ctrl+C in terminal to stop.

### Step 6: Upload Frontend to GitHub
```bash
git init
git add .
git commit -m "frontend"
git remote add origin https://github.com/YOUR_USERNAME/frontend.git
git branch -M main
git push -u origin main
```

### Step 7: Deploy Frontend to Netlify
1. Go to https://netlify.com
2. Sign up with GitHub
3. Click "Add new site"
4. Choose your frontend repo
5. Click "Deploy"
6. Wait 2 minutes
7. Done! You'll get a URL

---

## SUMMARY

### You Now Have:
**Backend:** https://your-railway-app.up.railway.app
**Frontend (optional):** https://your-netlify-app.netlify.app

### If Something Goes Wrong:
- Close terminal and open new one
- Type: `cd ai-visibility-mvp`
- Then try again

---

## THAT'S EVERYTHING!

You have a working AI Visibility MVP now.

You're done! 🎉
