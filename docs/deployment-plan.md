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

## 2️⃣ Production Deployment Options
### A. Direct VM / Cloud Instance
1. **Provision a server** (e.g., AWS EC2, Azure VM, DigitalOcean Droplet) with at least 2 GB RAM.
2. Install Node.js and Git.
3. Pull the repository and install deps:
   ```bash
   git clone <repo-url>
   cd Mutual-Fund-FAQ
   npm ci
   ```
4. Set up a **systemd** service (or PM2) to keep the process alive:
   ```ini
   # /etc/systemd/system/mutual-fund-faq.service
   [Unit]
   Description=Mutual Fund FAQ Backend
   After=network.target

   [Service]
   WorkingDirectory=/path/to/Mutual-Fund-FAQ
   ExecStart=/usr/bin/node src/server.js
   Restart=always
   Environment=PORT=3000

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now mutual-fund-faq
   ```
5. **Reverse‑proxy** with Nginx (optional) to serve HTTPS and route `/` to the `public/` folder.
6. **Initial data load** – run `npm run fetch && npm run ingest` once after deployment.

### B. Docker Container
Create a `Dockerfile`:
```dockerfile
# Use official Node LTS image
FROM node:20-alpine
WORKDIR /app

# Copy only needed files
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Expose the API port
EXPOSE 3000

# Run ingestion on container start (ensures latest data)
CMD ["sh", "-c", "npm run fetch && npm run ingest && node src/server.js"]
```
Build & run:
```bash
docker build -t mutual-fund-faq .
# Persist the data folder on the host if you want the index to survive container restarts
docker run -d -p 80:3000 -v $(pwd)/data:/app/data mutual-fund-faq
```
You can push the image to any container registry and deploy to services like AWS ECS, Google Cloud Run, or Render.

## 3️⃣ Continuous Deployment (CD) with GitHub Actions
Add a simple **deployment workflow** that triggers on push to `main`:
```yaml
name: Deploy
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install deps
        run: npm ci
      - name: Build Docker image
        run: |
          docker build -t ghcr.io/${{ github.repository }}:latest .
          echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker push ghcr.io/${{ github.repository }}:latest
      - name: Deploy to server (SSH)
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            docker pull ghcr.io/${{ github.repository }}:latest
            docker stop mutual-fund-faq || true
            docker rm mutual-fund-faq || true
            docker run -d --name mutual-fund-faq -p 80:3000 -v /opt/mutual-fund-faq/data:/app/data ghcr.io/${{ github.repository }}:latest
```
*Replace the `SERVER_*` secrets with your own VM details.* This workflow ensures **every push** results in an up‑to‑date container running the latest code and data.

## 4️⃣ Scheduler Verification (Daily Run)
- The **Daily Ingestion Scheduler** workflow lives at `.github/workflows/scheduler.yml`.
- It runs every day at **10:00 AM IST** (cron: `30 4 * * *`).
- After each run you can verify:
  1. In **GitHub → Actions** you’ll see a successful run entry.
  2. A new commit titled `Auto‑update mutual fund data` appears – open it to see the updated `schemes_data.json`.
  3. The vector index is rebuilt (`npm run ingest`) automatically, so any newly deployed instance will load the fresh data on startup.

## 5️⃣ Monitoring & Logging
- **Server logs** (stdout) already include timestamps for ingestion (`[2026‑06‑04T…]`). Capture them with a log‑aggregation tool (e.g., Papertrail, Loki) or by configuring Docker’s logging driver.
- **GitHub Actions** provides the full console output for each run – you can download the log from the run page.
- **Health‑check endpoint** (optional):
  ```js
  app.get('/health', (req, res) => res.json({status: 'ok', timestamp: new Date()}));
  ```
  Add this to `src/server.js` and monitor it with a service like UptimeRobot.

---
### Quick Checklist for Production
- [ ] Install Node 20 on target host (or use Docker). 
- [ ] Pull repository and run `npm ci`. 
- [ ] Run `npm run fetch && npm run ingest` once to populate the DB. 
- [ ] Set up a systemd/PM2/Docker container to keep `src/server.js` running. 
- [ ] Expose the service behind HTTPS (Nginx/Traefik). 
- [ ] Verify the **Daily Ingestion Scheduler** workflow is enabled and successful. 
- [ ] (Optional) Add the CD workflow above for zero‑downtime updates.

With these steps the Mutual Fund FAQ Assistant will always serve **the latest fund data** to end‑users, automatically refreshed every day.
