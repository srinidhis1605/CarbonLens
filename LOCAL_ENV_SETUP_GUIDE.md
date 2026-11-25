# CarbonLens 2.0 — Local Environment Setup Guide

This guide documents all environment variables referenced by the CarbonLens 2.0 backend and frontend source code. **Do not commit `.env` files or real credentials to Git.**

---

## 1. Backend Environment (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in your local or Aiven values:

| Variable | Required | Source Reference | Description / Safe Default |
|---|---|---|---|
| `PORT` | **Yes** | `backend/server.js` | Express server port (e.g. `5000`). Server throws on startup if missing. |
| `FRONTEND_ORIGIN` | **Yes** | `backend/server.js` | Comma-separated CORS allowlist (e.g. `http://localhost:3000`). Server throws on startup if missing. |
| `DB_HOST` | **Yes** | `backend/db.js` | MySQL host (`localhost` for local MySQL80, or your Aiven hostname). |
| `DB_PORT` | Optional | `backend/db.js` | MySQL port (defaults to `3306`; Aiven uses its assigned port). |
| `DB_USER` | **Yes** | `backend/db.js` | MySQL username (e.g. `root` locally, or `avnadmin` on Aiven). |
| `DB_PASSWORD` | **Yes** | `backend/db.js` | MySQL password (kept strictly in your local `.env`). |
| `DB_NAME` | **Yes** | `backend/db.js` | Database name (`carbonlens_db` locally, or `defaultdb` on Aiven). |
| `DB_SSL` | Optional | `backend/db.js` | Set `false` for local MySQL; `true` for Aiven SSL. |
| `DB_SSL_CA` | Conditional | `backend/db.js` | Path to CA cert file when `DB_SSL=true` (defaults to `./certs/ca.pem`). |
| `DB_SSL_CA_PEM` | Conditional | `backend/db.js` | Inline PEM string (newlines escaped as `\n`) alternative to `DB_SSL_CA`. |
| `JWT_SECRET` | **Yes** | `backend/routes/auth.js`, `backend/middleware/authMiddleware.js` | Secret used to sign 1-hour JWT access tokens. |
| `JWT_REFRESH_SECRET` | **Yes** | `backend/routes/auth.js` | Secret used to sign 7-day JWT refresh tokens. |
| `AI_API_KEY` | Recommended | `backend/routes/recommendations.js`, `backend/routes/seoRecommendations.js`, `backend/services/sustainabilityAgentService.js` | Google AI Studio Gemini API key. If omitted, Module 1 (AI Sustainability Agent) cleanly falls back to deterministic evidence-based analysis (labeled `deterministic_fallback`). |
| `AI_BASE_URL` | Optional | `backend/services/sustainabilityAgentService.js` | Defaults to `https://generativelanguage.googleapis.com/v1beta/openai/`. |
| `AI_MODEL` | Optional | `backend/services/sustainabilityAgentService.js` | Defaults to `gemini-2.5-flash`. |
| `AI_TIMEOUT_MS` | Optional | `backend/services/sustainabilityAgentService.js` | Gemini request timeout in ms (defaults to `20000`). |
| `PERFORMANCE_GOTO_TIMEOUT_MS` | Optional | `backend/services/analysisService.js` | Playwright navigation timeout (defaults to `30000`). |
| `PERFORMANCE_SETTLE_MS` | Optional | `backend/services/analysisService.js` | Post-load settle window in ms (defaults to `1500`). |
| `SEO_CRAWL_TIME_BUDGET_MS` | Optional | `backend/services/analysisService.js` | SEO BFS crawler budget (defaults to `35000`). |
| `SEO_MAX_CRAWL_PAGES` | Optional | `backend/services/analysisService.js` | Safety cap on discovered SEO pages (defaults to `500`). |
| `SEO_MAX_METADATA_PAGES` | Optional | `backend/services/analysisService.js` | Max pages visited by Playwright for SEO metadata (defaults to `8`). |
| `CONTROLLED_SITE_BASE_URL` | Optional | `backend/services/validationService.js` | Base URL where controlled test website is served (defaults to `http://localhost:${PORT}/controlled-site`). |

---

## 2. Frontend Environment (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:

| Variable | Required | Source Reference | Description |
|---|---|---|---|
| `REACT_APP_API_URL` | **Yes** | `frontend/src/services/api.js` | Backend API base URL (e.g. `http://localhost:5000`). |

---

## 3. Database Schema Setup

1. **Base CarbonLens v1 schema**:
   - Local MySQL: execute `backend/database.sql`
   - Aiven MySQL: execute `backend/database-aiven.sql`
2. **CarbonLens 2.0 additive migration**:
   - Execute `backend/migrations/001_carbonlens_v2_tables.sql` (also applied automatically and idempotently on backend startup via `ensureV2Tables()`).
