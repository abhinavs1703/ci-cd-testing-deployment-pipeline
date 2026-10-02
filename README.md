# CI/CD Pipeline Demo

A Node.js web service used to demonstrate a complete CI/CD pipeline with GitHub Actions, Docker, GitHub Container Registry (GHCR), automated testing, deployment, and post-deployment health verification.

The project is intentionally kept simple so that the complete CI/CD flow can be understood, tested, and explained clearly.

## Project Status

The project is being built in stages.

Current foundation:

- Node.js + Express application
- Automated tests using Node's built-in test runner and Supertest
- ESLint
- Multi-stage Dockerfile
- Docker Compose for local development
- GitHub Actions test workflow

Target CI/CD flow:

```text
Git Push
    ↓
GitHub Actions
    ↓
Test + Lint
    ↓
Docker Build
    ↓
Push Image to GHCR
    ↓
Deployment Webhook
    ↓
Production Server
    ↓
Container Restart
    ↓
/healthz Verification