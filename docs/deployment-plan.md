# Deployment Plan for Mutual Fund FAQ Assistant

## Overview
The Mutual Fund FAQ Assistant is a Node.js backend (Express) that serves a REST API (`/api/chat` and `/api/ingest`) and a static frontend (`public/`).  Data is stored in a local JSON corpus (`data/corpus/schemes_data.json`) which is transformed into a vector index by the ingestion pipeline.  A daily GitHub Actions workflow keeps the corpus up‑to‑date by scraping live fund data.

## Prerequisites
| Item | Version/Notes |
|------|----------------|
| **Node.js** | v20 LTS (or any recent LTS) |
| **npm** | v10+ |
| **Git** | For pulling the repo and committing the updated corpus |
| **Docker (optional)** | If you prefer containerised deployment |
| **Secrets** | `GITHUB_TOKEN` (automatically provided in GitHub Actions) – no additional secrets needed for the scraper. |

## 1️⃣ Local Development / Testing
```bash
# Clone the repo
git clone https://github.com/aanishasethi2028/buildingHours_NextLeap_MutualFundFAQ.git
cd buildingHours_NextLeap_MutualFundFAQ

# Install dependencies
npm ci   # or npm install

# Run the daily fetcher (optional, updates data locally)
npm run fetch

# Run ingestion to rebuild the vector DB
npm run ingest

# Start the server (dev mode)
npm run dev   # or npm start
```
Open `http://localhost:3000` and test the chat endpoint via the UI or with `curl`:
```bash
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"message":"What is the expense ratio of Axis Small Cap?"}'
```
You should see the **live** expense‑ratio (`0.79%`) and a citation date of **June 4 2026**.

## 2️⃣ Production Deployment (Railway / Render)
This project is designed to be easily deployed on a Platform-as-a-Service (PaaS) like [Railway.app](https://railway.app/) or [Render.com](https://render.com/). 

**Important Note on Frontend + Backend Deployment:**
You do **NOT** need a separate service like Vercel for the frontend. Your Node.js backend (Express) is already configured to serve the frontend static files from the `public/` directory. Deploying this project on Railway will host **both** the frontend and the backend simultaneously on the same URL.

### Deployment Steps (Railway Example):
1. Create a free account on Railway.app.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your repository: `aanishasethi2028/buildingHours_NextLeap_MutualFundFAQ`.
4. Railway will automatically detect that it's a Node.js project. It will use `npm install` and `npm start` by default.
5. Go to the **Variables** tab for your service in Railway and add:
   - `LLM_API_KEY`: *(Your Groq API Key)*
6. Railway will build and deploy the app automatically.

### How Auto-Updates (RAG) Work on Railway:
- Your GitHub Action (`scheduler.yml`) runs daily, scrapes new data, and pushes `schemes_data.json` to the `main` branch.
- Railway constantly listens to your `main` branch.
- When the new data is pushed, Railway instantly triggers a new deployment.
- Upon startup (`npm start`), `server.js` triggers `runIngestion()`, rebuilding the ChromaDB vector index with the fresh data before serving traffic.
- **Result:** Fully autonomous, zero-downtime updates!

## 3️⃣ Scheduler Verification (Daily Run)
- The **Daily Ingestion Scheduler** workflow lives at `.github/workflows/scheduler.yml`.
- It runs every day at **10:00 AM IST** (cron: `30 4 * * *`).
- After each run you can verify:
  1. In **GitHub → Actions** you’ll see a successful run entry.
  2. A new commit titled `Auto‑update mutual fund data` appears – open it to see the updated `schemes_data.json`.
  3. Railway will detect this commit and automatically redeploy the new data.

## 4️⃣ Monitoring & Logging
- **Server logs** (stdout) are automatically captured by Railway. You can view them in the Railway dashboard under the "Deployments" tab to see exactly when ingestion completes.
- **GitHub Actions** provides the full console output for the daily scraping job.

---
### Quick Checklist for Production
- [ ] Connect repository to Railway/Render. 
- [ ] Set `LLM_API_KEY` in environment variables.
- [ ] Verify the **Daily Ingestion Scheduler** workflow is enabled and successful on GitHub. 
- [ ] Test the chatbot on the live Railway URL.

With these steps the Mutual Fund FAQ Assistant will always serve **the latest fund data** to end‑users, automatically refreshed every day.
