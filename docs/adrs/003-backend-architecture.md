# ADR-003: Backend Architecture - Node.js Express Server

## Status
Accepted

## Date
2026-02-22

## Context
The app needs to:
- Serve static HTML files (one per feature module)
- Proxy calls to the Gemini AI API (hide API key)
- Provide CRUD endpoints for task data
- Be expandable for future features (second brain, etc.)

## Options Considered
1. **No backend (browser-only)** - Gemini called via fetch from browser, LocalStorage for data
2. **Light Node.js Express server** - Serves static files, proxies AI calls, CRUD API
3. **Full SPA with build tooling** - Vite/Webpack, separate API server, component modules

## Decision
Light Node.js Express server with static file serving and REST API endpoints.

## Rationale
- API key stays server-side in `.env` (not exposed in browser source)
- Express is minimal and educational (user is learning Express patterns)
- Each feature remains a self-contained HTML file in `public/`
- Adding new features = drop a new HTML file + add API routes
- No build step, no bundler, no framework overhead
- Clean separation: frontend is Alpine.js in HTML, backend is Express REST API

## Consequences
- Requires Node.js runtime to run the app
- Need to manage a server process (can use nodemon for dev)
- API routes will grow as features are added - may need route organization later
- Docker can be added for deployment when ready (port 8080 is reserved by Laravel Herd)
