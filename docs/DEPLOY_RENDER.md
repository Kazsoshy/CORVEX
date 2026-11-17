# Deploy CORVEX on Render (step by step)

This guide is written for **this repo**: React/Vite frontend + Express API + PostgreSQL.

You will create **3 things** on Render:

1. **PostgreSQL** database  
2. **Web Service** = API (`backend/server.js`)  
3. **Static Site** = frontend (`npm run build` → `dist/`)

Domain comes **last**. You can finish the whole deploy on free `*.onrender.com` URLs first.

---

## Before you start (checklist)

- [ ] Code works locally (`npm run dev:server` + `npm run dev`)
- [ ] GitHub account
- [ ] Project pushed to a **GitHub** repo (private is fine)
- [ ] Render account: https://render.com (sign up with GitHub)

### Important code gap (must fix before production login from the website)

CORS in `backend/server.js` currently allows **only localhost**:

```js
origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'],
```

For production, allow your frontend URL(s), for example:

```js
origin: [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL, // e.g. https://corvex-web.onrender.com
].filter(Boolean),
```

Commit that change **before** (or right after) the first API deploy, or the browser will block API calls.

---

## Step 0 — Push your code to GitHub

If the repo is not on GitHub yet:

1. Create a new empty repo on GitHub (do not add README if you already have one).
2. From your project folder:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Render deploys from GitHub, so every later `git push` can redeploy automatically.

---

## Step 1 — Create the PostgreSQL database

1. Open Render Dashboard → **New** → **PostgreSQL**
2. Settings to use:
   - **Name:** `corvex-db`
   - **Database:** `corvex` (or leave default)
   - **User:** leave default
   - **Region:** pick one close to you (e.g. Singapore / Oregon) — **use the same region for API later**
   - **Plan:** Free is OK for demos (note: free DBs can expire / sleep on some plans)
3. Click **Create Database**
4. Wait until status is **Available**
5. Open the DB → **Connections** / **Info**
6. Copy these values (you will paste them into the API service):
   - Host
   - Port (usually `5432`)
   - Database
   - User
   - Password

Keep this tab open.

> CORVEX expects separate vars (`DB_HOST`, `DB_USER`, …), not only `DATABASE_URL`.

---

## Step 2 — Create the API (Web Service)

1. Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:

| Field | Value |
|---|---|
| Name | `corvex-api` |
| Region | **same as the database** |
| Root Directory | *(leave empty)* |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `node backend/server.js` |
| Instance type | Free (for testing) |

4. Open **Environment** and add:

```env
NODE_ENV=production
PORT=10000

DB_HOST=<from Render Postgres>
DB_PORT=5432
DB_NAME=<from Render Postgres>
DB_USER=<from Render Postgres>
DB_PASSWORD=<from Render Postgres>

AUTH_SECRET=<generate a long random string, 32+ chars>

FRONTEND_URL=https://corvex-web.onrender.com
```

Notes:

- Render sets `PORT` automatically on many plans. If it conflicts, keep Render’s `PORT` and do **not** hardcode a different one. Your server already uses `process.env.PORT`.
- `FRONTEND_URL` should match the Static Site URL you will create in Step 4. You can update it after the frontend exists.
- Optional later (emails):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Corvex Accounts <you@gmail.com>"
COMPANY_NAME=Corvex
SUPPORT_EMAIL=support@yourdomain.com
```

5. Click **Create Web Service**
6. Wait for the first deploy. Open **Logs**.
7. You want to see something like: `CORVEX API running at ...`
8. Copy your API URL, example:

`https://corvex-api.onrender.com`

### Quick API health check

In a browser or terminal, open:

`https://corvex-api.onrender.com/api/...`  
(whatever public health/login route you already have)

If the service crashed with `DB_PASSWORD is not set`, your env vars are missing/misnamed.

---

## Step 3 — Run database migrations on Render

Your schema is created by:

```bash
npm run migrate
```

Easiest reliable way for a first deploy:

### Option A — One-off Shell (recommended if available on your plan)

1. Open the `corvex-api` service
2. Open **Shell**
3. Run:

```bash
npm run migrate
```

Optional demo seeds (only if you want sample data):

```bash
npm run seed:saw-davao
npm run seed:secondary-branches
npm run seed:demo-customer
```

### Option B — Temporary migrate-on-boot (only if you have no Shell)

Change Start Command temporarily to:

```bash
npm run migrate && node backend/server.js
```

Deploy once, confirm migrations succeed in logs, then change Start Command back to:

```bash
node backend/server.js
```

Do **not** leave migrate-on-every-boot forever unless you are sure migrations are fully idempotent and fast.

---

## Step 4 — Create the frontend (Static Site)

1. Render Dashboard → **New** → **Static Site**
2. Connect the **same** GitHub repo
3. Settings:

| Field | Value |
|---|---|
| Name | `corvex-web` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

4. Add environment variable:

```env
VITE_API_URL=https://corvex-api.onrender.com/api
```

Important:

- This must be set **at build time** (Vite bakes it into the JS bundle).
- After changing `VITE_API_URL`, click **Manual Deploy → Clear build cache & deploy**.

5. Create the site and wait for build success.
6. Copy the frontend URL, example:

`https://corvex-web.onrender.com`

7. Go back to **corvex-api** env vars and set:

```env
FRONTEND_URL=https://corvex-web.onrender.com
```

Then redeploy the API (so CORS / email links use the real frontend URL).

---

## Step 5 — First production test (no custom domain yet)

1. Open `https://corvex-web.onrender.com`
2. Try login with a seeded / known account
3. If login fails, check in this order:
   - Browser DevTools → **Network** → failed request URL (should hit `corvex-api.../api/...`)
   - CORS error? → frontend origin not allowed in API CORS list / `FRONTEND_URL` mismatch
   - 500 from API? → API logs + DB connection / migrations
   - Free tier sleeping? → first request can take 30–60s while the API wakes up

---

## Step 6 — Buy and connect a domain (when ready)

You can do this **after** the system works on Render URLs.

### 6.1 Buy the domain

Good options: Cloudflare Registrar, Namecheap, or a PH registrar.

Example:

- `bhmarketing.ph` or `corvex.ph`

You do **not** need the domain to finish coding.

### 6.2 Suggested hostnames

| Hostname | Points to |
|---|---|
| `app.yourdomain.com` | Frontend Static Site |
| `api.yourdomain.com` | API Web Service |

(You can also use apex `yourdomain.com` for the frontend.)

### 6.3 Attach domain in Render

**Frontend**

1. Open `corvex-web` → **Settings** → **Custom Domains**
2. Add `app.yourdomain.com`
3. Render shows DNS records to create (usually a CNAME)

**API**

1. Open `corvex-api` → **Settings** → **Custom Domains**
2. Add `api.yourdomain.com`
3. Create the DNS record Render shows

### 6.4 Create DNS records at your registrar

Example (exact values come from Render):

```text
CNAME  app  →  corvex-web.onrender.com
CNAME  api  →  corvex-api.onrender.com
```

Wait for DNS (often minutes, sometimes up to a few hours). Render will issue HTTPS certificates automatically.

### 6.5 Update env vars after domain works

API:

```env
FRONTEND_URL=https://app.yourdomain.com
```

Frontend (rebuild required):

```env
VITE_API_URL=https://api.yourdomain.com/api
```

Then:

1. Redeploy API  
2. Redeploy frontend with **clear build cache**  
3. Confirm CORS includes `https://app.yourdomain.com`

---

## Step 7 — Ongoing workflow

Every time you change code:

```bash
git add .
git commit -m "your message"
git push
```

Render redeploys automatically (if auto-deploy is on).

If you only changed frontend env (`VITE_*`), force a clean rebuild.

---

## Cost / free-tier reality check

- Free Web Services on Render **sleep** after idle time → first load is slow.
- Free Postgres may have limits / expiry depending on current Render plans.
- For a thesis defense or client demo, start the site 5–10 minutes early so services are awake.
- When the system is serious production, upgrade API + DB off free tier.

---

## Exact env cheat sheet

### API (`corvex-api`)

Required:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `AUTH_SECRET`
- `FRONTEND_URL`
- `NODE_ENV=production`

Optional:

- `SMTP_*` for customer activation emails
- `OSRM_BASE_URL` if you self-host routing later

### Frontend (`corvex-web`)

Required at build time:

- `VITE_API_URL=https://YOUR-API-HOST/api`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site loads, login fails with CORS | API origin allowlist still localhost | Allow `FRONTEND_URL` / real frontend origin |
| Frontend calls `/api` on the static host | `VITE_API_URL` missing at build | Set env + clear cache redeploy |
| API crash on boot | Missing `DB_PASSWORD` | Add DB env vars |
| Tables missing / SQL errors | Migrations not run | `npm run migrate` in Shell |
| Works then “goes down” | Free service slept | Wait for cold start, or upgrade |
| Emails never send | SMTP not configured | Add `SMTP_*` env vars |

---

## Recommended order (short version)

1. Push to GitHub  
2. Fix CORS for production frontend URL  
3. Create Postgres  
4. Create API + env vars  
5. Run migrations  
6. Create Static Site with `VITE_API_URL`  
7. Test on `*.onrender.com`  
8. Buy domain later → attach custom domains → update env → redeploy  

If you want, the next hands-on step in Cursor is: I can patch CORS for production and add a tiny `/api/health` route so deploy checks are easier.
