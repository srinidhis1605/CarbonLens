# CarbonLens

**An AI-based website carbon impact analyzer for sustainable web analytics.**

CarbonLens helps developers and business owners measure the environmental cost of a website, review performance and SEO health, and get AI-backed tips to reduce page weight and carbon impact.

---

## About

Paste a URL and CarbonLens:

1. Scans the page with a headless browser (Playwright)
2. Estimates page weight, network traffic, speed metrics, and a carbon / sustainability score
3. Checks green hosting via the Green Web Foundation API
4. Optionally runs a deeper SEO audit (robots.txt, sitemap, meta, mobile, compliance)
5. Loads AI sustainability suggestions on the results page

Users can sign in, save analyses, and reopen them from **Recent analysis** history.

---

## Key features

- **Carbon & performance scan** — page weight, asset breakdown (images, scripts, styles, fonts), TTFB / DOM ready / load estimates, carbon score and grade
- **Green hosting check** — Green Web Foundation greencheck API
- **SEO audit** — robots.txt, sitemap.xml, discovered pages, meta tags, Open Graph, social links, mobile optimization, legal page links, keywords
- **AI recommendations** — Gemini (OpenAI-compatible API) for sustainability tips and SEO structural suggestions
- **Analysis history** — saved reports restored from MySQL (full payload when available)
- **CSV export** — export discovered sitemap / crawl URLs from the SEO audit checklist
- **Auth** — register / login with JWT access + refresh tokens (cookies + Bearer)
- **Loading UX** — staged progress overlay for performance analysis and SEO audit

---

## Technology stack

| Layer | Tech |
|--------|------|
| Frontend | React 18, React Router, Tailwind CSS, Recharts, Axios |
| Backend | Node.js, Express 5 |
| Browser automation | Playwright (Chromium) |
| Database | MySQL (`mysql2`) — local or Aiven |
| AI | Google Gemini via OpenAI-compatible client (`openai` SDK) |
| Auth | JWT (`jsonwebtoken`), bcrypt |
| Deploy | Frontend: Netlify · Backend: Render · DB: Aiven MySQL |
| Optional | Docker Compose |

---

## System architecture

```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│  React frontend │ ─────────────► │  Express API     │
│  (Netlify)      │                │  (Render)        │
└─────────────────┘                └────────┬─────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
              ┌────────────┐        ┌─────────────┐        ┌──────────────┐
              │ MySQL      │        │ Playwright  │        │ Gemini API   │
              │ (Aiven)    │        │ page scan   │        │ + Green Web  │
              └────────────┘        └─────────────┘        └──────────────┘
```

**Main flows**

1. `POST /analysis` — performance + carbon scan, save to DB, return report (AI loads separately on the results page)
2. `POST /analysis/seo-audit` — SEO suite + SEO AI tips
3. `GET /analysis/history` — recent analyses for the logged-in user
4. `GET /analysis/:id` — restore a saved analysis

---

## Functional modules

1. **Authentication** — register, login, refresh; JWT middleware on protected routes
2. **Performance analysis** — Playwright metrics, normalization, carbon score, green host flag
3. **SEO engine** — HTTP crawl / robots / sitemap + Playwright metadata extraction
4. **Recommendation engines** — performance AI (`/recommendations`) and SEO AI
5. **Persistence** — websites + analysis tables, JSON payloads for full report restore
6. **Dashboard & report UI** — URL input, charts, SEO sections, history list, loading overlay

---

## Project structure

```
CarbonLens/
├── backend/
│   ├── routes/           # auth, analysis, recommendations, SEO AI
│   ├── services/         # Playwright scan, SEO crawl, DB, normalization
│   ├── middleware/       # JWT auth
│   ├── database.sql      # local MySQL schema
│   ├── database-aiven.sql
│   ├── .env.example
│   └── server.js
├── frontend/
│   ├── src/pages/        # Login, Register, Dashboard, AnalysisResult
│   ├── src/components/   # charts, SEO report, history, loading overlay
│   ├── public/.htaccess  # Apache SPA fallback (if needed)
│   └── .env.example
├── docker-compose.yml
└── README.md
```

---

## Getting started

### Prerequisites

- Node.js 18+
- MySQL (local or Aiven)
- Playwright browsers (installed with the backend dependency / `npx playwright install` if needed)
- Gemini API key (Google AI Studio)

### 1. Database

**Local:** run `backend/database.sql` against MySQL.

**Aiven:** run `backend/database-aiven.sql` in the Aiven query editor. Download the CA cert to `backend/certs/ca.pem` (or set `DB_SSL_CA_PEM`).

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with DB_*, JWT_*, AI_API_KEY, FRONTEND_ORIGIN, PORT
npm install
npx playwright install chromium
npm start
```

API default: `http://localhost:5000`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Set REACT_APP_API_URL=http://localhost:5000
npm install
npm start
```

App default: `http://localhost:3000`

### 4. Docker (optional)

```bash
# Ensure backend/.env and backend/certs/ca.pem are set for Aiven SSL
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `DB_SSL`, `DB_SSL_CA` / `DB_SSL_CA_PEM` | SSL for Aiven |
| `PORT` | Express port |
| `FRONTEND_ORIGIN` | Comma-separated allowed CORS origins |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Auth tokens |
| `AI_API_KEY` | Gemini API key |
| `AI_BASE_URL` | Optional; defaults to Gemini OpenAI-compatible endpoint |

### Frontend (`frontend/.env`)

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_URL` | Backend base URL (e.g. `http://localhost:5000` or Render URL) |

---

## Deployment notes

- **Backend (Render):** set all backend env vars; keep Aiven MySQL **powered on** (free tier may power off and break DNS/login).
- **Frontend (Netlify):** set `REACT_APP_API_URL` to the Render API URL; include your Netlify origin in `FRONTEND_ORIGIN`.
- **Aiven:** use the current host/port from the console; free services can rebuild or power off after inactivity.

