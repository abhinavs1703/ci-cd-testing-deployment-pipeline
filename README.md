# CI/CD Pipeline Demo

A Node.js web service demonstrating a complete CI/CD pipeline using GitHub Actions, Docker, GitHub Container Registry (GHCR), and Render.

The pipeline automatically tests the application, builds and publishes a Docker image, deploys the image to production, and verifies the production health endpoint after deployment.

The project is intentionally kept simple so the complete CI/CD flow can be understood, tested, and explained clearly.

## Project Status

The CI/CD pipeline is fully implemented and working.

The production pipeline is:

```text
Developer pushes to main
        ↓
GitHub Actions
        ↓
Test application
        ├── npm ci
        ├── ESLint
        └── Automated tests
        ↓
Build and push Docker image
        ├── Docker Buildx
        ├── Build image
        └── Push image to GHCR
        ↓
Deploy to production
        └── Render deployment webhook
        ↓
Production health verification
        └── GET /healthz
