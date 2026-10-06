# CI/CD Pipeline Demo

A small Node.js web service demonstrating a complete CI/CD pipeline with GitHub Actions, Docker, GitHub Container Registry (GHCR), and Render.

The pipeline automatically:

1. Installs dependencies
2. Runs ESLint
3. Runs automated tests
4. Builds a production Docker image
5. Pushes the image to GHCR
6. Triggers a Render deployment
7. Verifies the production `/healthz` endpoint

The project is intentionally simple so the entire flow can be understood and explained clearly in a junior DevOps interview.

## Live Demo

**Production:**  
https://ci-cd-testing-deployment-pipeline.onrender.com

Useful endpoints:

- `/` — basic application response
- `/healthz` — deployment health check
- `/version` — application version and deployed Git commit

Example:

```text
GET /healthz
→ {"status":"ok"}
```

## CI/CD Architecture

```text
Developer pushes to main
        ↓
GitHub Actions
        ↓
┌───────────────────────┐
│ Test application      │
│ - npm ci              │
│ - ESLint              │
│ - automated tests     │
└───────────────────────┘
        ↓
┌───────────────────────┐
│ Build + Push          │
│ - Docker Buildx       │
│ - GHCR authentication │
│ - image: latest       │
│ - image: sha-<commit> │
└───────────────────────┘
        ↓
┌───────────────────────┐
│ Deploy                │
│ - Render webhook      │
│ - production restart  │
└───────────────────────┘
        ↓
GET /healthz
        ↓
Production verified
```

### Job dependency

The GitHub Actions workflow intentionally enforces:

```text
test → build-and-push → deploy
```

If the test job fails, the Docker build/push and deployment jobs do not run.

Pull requests run the test job only. Docker publishing and production deployment happen only for pushes to `main`.

## Repository Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── src/
│   ├── app.js
│   └── server.js
├── test/
│   └── app.test.js
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── .dockerignore
├── .eslintrc.json
└── README.md
```

## Application

The service uses Node.js and Express.

Endpoints:

| Endpoint | Purpose |
|---|---|
| `/` | Basic application response |
| `/healthz` | Health check used after deployment |
| `/version` | Shows application version and Git commit |

Automated tests use Node's built-in test runner and Supertest.

## Run Locally

Install dependencies:

```bash
npm ci
```

Run lint:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Start the application:

```bash
npm start
```

The application listens on port 3000 by default.

### Docker Compose

```bash
docker compose up --build
```

Then verify:

```text
http://localhost:3000/
http://localhost:3000/healthz
http://localhost:3000/version
```

## Docker

The project uses a multi-stage Dockerfile based on Node.js 24 Alpine.

The image:

- Installs production dependencies
- Copies the application
- Passes the Git commit into the image
- Exposes port 3000
- Runs `src/server.js`

The CI pipeline publishes:

```text
ghcr.io/abhinavs1703/ci-cd-testing-deployment-pipeline:latest
ghcr.io/abhinavs1703/ci-cd-testing-deployment-pipeline:sha-<commit>
```

The SHA tag provides an immutable reference to a specific source commit, while `latest` provides the current deployment image.

## GitHub Actions

Workflow file:

```text
.github/workflows/ci-cd.yml
```

The workflow uses:

- `actions/checkout`
- `actions/setup-node`
- Docker Buildx
- Docker login
- Docker metadata
- Docker build/push

The workflow uses the built-in GitHub `GITHUB_TOKEN` for GHCR authentication. No registry password is hardcoded.

The Render deployment hook is stored as the repository secret:

```text
RENDER_DEPLOY_HOOK_URL
```

## Failure Behavior

The pipeline is designed to fail fast:

- If `npm ci`, linting, or tests fail, the test job fails.
- Because `build-and-push` needs `test`, the Docker image is not published after a failed test.
- Because `deploy` needs `build-and-push`, production deployment does not run after a failed build/push.
- Docker build/push failures stop the pipeline before deployment.
- The deployment health check uses `curl --fail` and retries while the new production instance starts.
- A non-200 health response causes the deployment job to fail.

## Security Notes

No credentials are stored in the repository.

Secrets are provided through GitHub Actions secrets, and the workflow grants only the permissions needed by each job:

- repository contents: read
- packages: write for the image publishing job

The deployment endpoint is protected by the secret Render deploy hook URL.

## Verification

The completed pipeline has been verified with successful GitHub Actions runs showing:

```text
Test application ✓
        ↓
Build and push Docker image ✓
        ↓
Deploy to production ✓
```

Production was also verified through:

```text
/healthz  → HTTP 200
/         → application response
/version  → application version + Git commit
```

## Interview Summary

A simple way to explain the project:

> "I built a GitHub Actions CI/CD pipeline for a Node.js application. Every push to main installs dependencies, runs linting and automated tests, and only if those pass does the pipeline build a Docker image and publish it to GHCR. The pipeline then triggers a Render deployment and verifies the production health endpoint. I used explicit job dependencies so a failed test or build cannot accidentally reach production."

Key DevOps concepts demonstrated:

- CI/CD
- GitHub Actions
- automated testing
- linting
- Docker multi-stage builds
- container registry publishing
- secrets management
- deployment webhooks
- health checks
- pipeline job dependencies
- fail-fast behavior
- immutable commit-based image tags
