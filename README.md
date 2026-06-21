# Anchor Vision

A camera-driven focus coach for the Berkeley AI Hackathon. See [PLAN.md](./PLAN.md) for the full architecture.

## Quick start

On WSL, use Linux-native pnpm (not the Windows shim):

```bash
corepack enable && corepack prepare pnpm@9.15.4 --activate
cp .env.example .env
# Fill in SENTRY_DSN (optional but recommended for M0 verification)

pnpm install
pnpm dev
```

### WSL / Linux note

If Electron fails with `libnss3.so: cannot open shared object file`, install the required libraries:

```bash
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2
```

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
