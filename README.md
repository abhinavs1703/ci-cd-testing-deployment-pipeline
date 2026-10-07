# CI/CD Pipeline Demo

A small Node.js and Express service demonstrating CI/CD with GitHub Actions, Docker, GHCR, and Render.

## Status dashboard

The root page is a plain operational status dashboard. It checks `/`, `/healthz`, and `/version` directly from the browser, measures response time, shows the running commit and version, compares the running commit with the newest push run on `main`, and displays the latest pipeline stages and job steps.

It also shows the latest 12 main-branch push runs, a duration bar chart, run filters, and the last 10 endpoint check results stored in the browser. The page supports light and dark mode, is responsive, and auto-refreshes every 60 seconds.

## `/api/pipeline`

`GET /api/pipeline` uses Node.js built-in `fetch` to read the GitHub REST API. It returns the latest 12 push workflow runs on `main`, plus jobs and steps for the newest run, using this shape:

```json
{"runs": [], "jobs": [], "error": null}
```

GitHub data is cached for 60 seconds. If GitHub is unavailable or rate-limits the request, the endpoint returns HTTP 200 with the cached data and an `error` message instead of returning a 500 response. The dashboard shows a visible stale-data warning.

`GITHUB_TOKEN` is optional. When present, the server sends it as a bearer token to GitHub. It can provide a higher GitHub API rate limit.

## CI/CD architecture

```text
push to main
    ↓
Test application
    ↓
Build and push Docker image
    ↓
Deploy to production
    ↓
Verify production health
```

The workflow dependency is `test → build-and-push → deploy`. The final deployment step verifies `/healthz` with `curl --fail`.

## Repository structure

```text
.
├── .github/workflows/ci-cd.yml
├── public/
│   ├── index.html
│   ├── dashboard.css
│   └── dashboard.js
├── src/
│   ├── app.js
│   └── server.js
├── test/app.test.js
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── .dockerignore
├── .eslintrc.json
└── README.md
```

## Run locally

```bash
npm ci
npm run lint
npm test
npm start
```

Open `http://localhost:3000/`.

Optional GitHub authentication can be supplied through the `GITHUB_TOKEN` environment variable before starting the server.

Docker Compose:

```bash
docker compose up --build
```

Then open `http://localhost:3000/`.

## Application endpoints

| Endpoint | Purpose |
|---|---|
| `/` | Status dashboard |
| `/healthz` | Production health check |
| `/version` | Version and deployed commit |
| `/api/pipeline` | Cached GitHub Actions data |

## Docker and deployment

The Dockerfile is a Node.js 24 Alpine multi-stage build and includes both `src/` and `public/`.

The CI pipeline publishes the `latest` image and an immutable `sha-<commit>` image to GHCR. Render is triggered through the existing `RENDER_DEPLOY_HOOK_URL` GitHub Actions secret.

No credentials are stored in the repository.

## Verification

The project demonstrates CI/CD job dependencies, automated tests and linting, Docker multi-stage builds, GHCR publishing, Render deployment, production health verification, commit traceability, live endpoint latency checks, GitHub Actions history, cached API failure handling, and a responsive status UI.
