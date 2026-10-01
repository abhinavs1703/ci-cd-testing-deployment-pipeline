# CI/CD Pipeline Demo (GitHub Actions & Docker)

A Node.js web service packaged with Docker and wired to CI/CD using **GitHub Actions** and **GitHub Container Registry (GHCR)**. The pipeline runs lint + tests on every push/PR, builds/pushes a Docker image on release, and can trigger deployment to a host via a deploy hook (e.g., Render) or a platform's CLI.

## Features
- Express app with `/` (hello), `/healthz`, and `/version` endpoints
- Unit/integration tests using Node's built-in test runner (`node:test`) + Supertest
- ESLint + Prettier + EditorConfig
- Multi-stage Dockerfile (small production image)
- `docker-compose.yml` for local dev
- GitHub Actions:
  - `ci.yml` – install → lint → test on push/PR
  - `docker-publish.yml` – build & push image to GHCR on tagged releases
  - `deploy-render.yml` – POST to a deploy hook URL (e.g., Render) on `main`

## Tech Stack
- **Runtime:** Node.js 20
- **Web:** Express
- **CI/CD:** GitHub Actions
- **Container Registry:** GHCR (GitHub Packages)
- **Container:** Docker (multi-stage build)

## Quickstart (Local)
```bash
npm ci
npm run dev

# Run tests & lint
npm test
npm run lint

# Run with Docker
docker compose up --build
# Open http://localhost:3000/ and http://localhost:3000/healthz
```

## Endpoints
- `GET /` → `{ message: "hello, world" }`
- `GET /healthz` → `{ status: "ok" }`
- `GET /version` → `{ version, commit }`

`/version` reads the app version from `package.json` and the Git commit from the `GIT_COMMIT` environment variable (if present).

## Configuration
- Port is controlled by `PORT` (defaults to `3000`).
- The `/version` endpoint reads `GIT_COMMIT` (set automatically in Docker and in Actions).
