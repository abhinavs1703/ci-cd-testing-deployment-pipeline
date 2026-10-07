# CI/CD Pipeline Demo

A small Node.js and Express service demonstrating CI/CD with GitHub Actions, Docker, GHCR, and Render.

## Status dashboard

The root page is a compact operations dashboard. It reads `/healthz` and `/version` directly from the served application, measures endpoint latency, shows the deployed version and commit, compares the deployed commit with the newest push run on `main`, and displays the latest GitHub Actions jobs and step timings.

It also shows the latest 12 main-branch runs with duration history, filters, commit links, actors, relative timestamps, endpoint latency history, and a 10-second optional endpoint check loop. The page supports light and dark mode and refreshes GitHub data every 60 seconds.

## `/api/pipeline`

`GET /api/pipeline` uses Node.js built-in `fetch` to read the GitHub REST API. It returns the latest 12 push workflow runs on `main`, jobs and steps for the newest run, and a commit comparison when `GIT_COMMIT` is available:

```json
{"runs": [], "jobs": [], "comparison": null, "error": null}
```

GitHub data is cached for 60 seconds. If GitHub is unavailable or rate-limits the request, the endpoint returns HTTP 200 with cached data and an `error` message instead of returning a 500 response. The dashboard shows a visible stale-data warning.

`GITHUB_TOKEN` is optional. When present, the server sends it as a bearer token to GitHub and can provide a higher GitHub API rate limit.

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

### Commit SHA propagation

The existing workflow already passes the Git commit SHA to Docker with:

```yaml
build-args: |
  GIT_COMMIT=${{ github.sha }}
```

The Dockerfile already declares `ARG GIT_COMMIT` in both stages and exports it as `ENV GIT_COMMIT` in the runtime image. The `/version` endpoint reads that runtime environment variable.

**No workflow or Dockerfile change was required for the dashboard redesign.** If a deployed environment still reports `"commit": "dev"`, that indicates the running deployment predates the SHA propagation configuration or was built outside the existing GitHub Actions path; it is not caused by the dashboard.

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
