#!/bin/bash
# AI Visibility MVP - Quick Cloud Deployment Script
# Deploys to Railway.app in 2 minutes

set -e

echo "=========================================="
echo "AI Visibility MVP - Cloud Deployment"
echo "=========================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is required but not installed"
    echo "Install from: https://git-scm.com/"
    exit 1
fi

echo "✅ Prerequisites Check"
echo ""

# Step 1: Prepare repository
echo "📦 Step 1: Prepare Repository"
cd ai-visibility-mvp

# Initialize git if needed
if [ ! -d .git ]; then
    echo "Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit - AI Visibility MVP"
else
    echo "Git repository already initialized"
fi

echo "✅ Repository ready"
echo ""

# Step 2: Information for user
echo "🌐 Step 2: Deploy to Railway"
echo ""
echo "To deploy to Railway.app (recommended for MVP):"
echo ""
echo "1. Go to https://railway.app"
echo "2. Sign up/login with GitHub"
echo "3. Create new project"
echo "4. Select 'Deploy from GitHub repo'"
echo "5. Connect this repository"
echo "6. Railway will automatically:"
echo "   - Detect Node.js project"
echo "   - Install dependencies"
echo "   - Build and deploy"
echo ""
echo "Your app will be live in ~5 minutes!"
echo ""

# Step 3: Environment variables guide
echo "📝 Step 3: Set Environment Variables"
echo ""
echo "In Railway dashboard, add these variables:"
echo ""
echo "NODE_ENV=production"
echo "JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo 'your-random-secret')"
echo "ANTHROPIC_API_KEY=your-key-here"
echo "OPENAI_API_KEY=your-key-here"
echo ""

# Step 4: Database setup
echo "🗄️  Step 4: Add PostgreSQL"
echo ""
echo "In Railway dashboard:"
echo "1. Click 'Add Service'"
echo "2. Select 'PostgreSQL'"
echo "3. Railway will create database automatically"
echo "4. DATABASE_URL will be set automatically"
echo ""

# Step 5: Deploy command
echo "🚀 Step 5: Deploy"
echo ""
echo "Option A: Push to GitHub (Auto-deploy)"
echo "  git push origin main"
echo ""
echo "Option B: Manual push to Heroku"
echo "  heroku login"
echo "  heroku create your-app-name"
echo "  git push heroku main"
echo ""

echo "✅ Deployment guide complete!"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub: git push origin main"
echo "2. Go to Railway.app and connect your repo"
echo "3. Add PostgreSQL database"
echo "4. Set environment variables"
echo "5. Deploy!"
echo ""
echo "Your API will be live at: https://your-app-name.railway.app"
echo ""
echo "Test with:"
echo "  curl https://your-app-name.railway.app/health"
echo ""
