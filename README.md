# Anchor Vision

A camera-driven focus coach for the Berkeley AI Hackathon. See [PLAN.md](./PLAN.md) for the full architecture.

## Quick start

On WSL, use Linux-native pnpm (not the Windows shim):

```bash
corepack enable && corepack prepare pnpm@9.15.4 --activate
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, REDIS_URL, and SENTRY_DSN (optional but recommended)

pnpm install
pnpm dev
```

### WSL / Linux note

**Webcam:** WSL2 cannot access your laptop camera. To use the webcam, run the app on **native Windows** (not WSL, not `\\wsl$\...`).

PowerShell **cannot** use `\\wsl$\...` as a working directory (`UNC paths are not supported`), and WSL's `node_modules` installs the **Linux** Electron binary anyway.

### Run with camera (Windows)

One-time setup in **PowerShell**:

```powershell
# 1. Clone/copy the repo to a Windows path (not WSL)
cd $env:USERPROFILE\developer
git clone https://github.com/adam-ajroudi/Aslope.git ai-hackathon-berkeley-2026
cd ai-hackathon-berkeley-2026

# 2. Copy your .env from WSL (adjust distro name if needed)
copy \\wsl$\Ubuntu\home\adam\developer\hackathons\ai-hackathon-berkeley-2026\.env .env

# 3. Install Node 20+ on Windows if needed: https://nodejs.org
corepack enable
pnpm install
pnpm dev
```

Camera + fullscreen overlay will work from this Windows install. Keep coding in WSL; sync via git or copy `.env` when keys change.

**WSL without camera:** use `pnpm dev` in WSL and click **Use demo feed** in the app.

If Electron fails with `libnss3.so: cannot open shared object file`, install the required libraries:

```bash
# Ubuntu 24.04 (Noble) — note the t64 suffix on some packages
sudo apt-get install -y \
  libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 \
  libcairo2 libx11-xcb1 libxcb-dri3-0 libxshmfence1
```

## Milestone 5

- Midjourney MCP via Anthropic connector (`mcp-client-2025-11-20`)
- After session prep, generates up to 4 images in the **background** (one per trigger/mode)
- Downloads CDN assets to local cache, serves via `nudge://` protocol in overlay
- Falls back to SVG placeholders if Midjourney fails or credentials missing

**Requires:** `MIDJOURNEY_MCP_URL`, `MIDJOURNEY_OAUTH_TOKEN` in `.env`  
**Optional:** `MIDJOURNEY_PREP_LIMIT=4` (max images per session)

## Milestone 4

- Claude session prep via Anthropic Messages API (no MCP yet)
- Generates personalized **quote pools** + **Midjourney image prompts** per trigger/mode
- Quotes cached in Redis (`quotes:*`, `assets:*`); image prompts stored at `prep:{userId}:prompts` for M5
- In-memory fallback when Redis is down; hardcoded fallback when API key missing
- UI shows "Claude is prepping…" during session start

**Requires:** `ANTHROPIC_API_KEY` in `.env`

## Milestone 3

- Redis asset cache — session start seeds nudges, triggers read from cache
- Session + trigger events logged to Redis (`session:*`, `events:*`)
- Falls back to hardcoded nudges if `REDIS_URL` is missing or unreachable
- Status panel shows Redis connection state

**Redis keys used:** `assets:{userId}:{trigger}:{mode}`, `session:{sessionId}`, `events:{userId}`

## Milestone 2

- End-to-end trigger → nudge loop (zero AI)
- Main process serves hardcoded image + quote per trigger/mode
- Ambient overlay on trigger with auto-dismiss
- **Fullscreen overlay window** — covers your entire display even when the main app is minimized
- Demo trigger buttons (CV detection lands in M1)

**Try it:** `pnpm dev` → Start session → click Slouch or Phone → overlay appears.

Pika integration is deferred to milestone 8.

## Milestone 0

- Electron + React + TypeScript shell
- Live webcam feed in the renderer
- Sentry initialized in main and renderer processes
- Typed IPC bridge (`window.anchor`) with stub handlers

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Electron in development mode |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | Run TypeScript checks |
