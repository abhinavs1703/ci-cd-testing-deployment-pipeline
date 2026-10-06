# syntax=docker/dockerfile:1

# --- Build stage ---
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production

# Inject the Git commit SHA into the application image
ARG GIT_COMMIT=dev-build
ENV GIT_COMMIT=$GIT_COMMIT

# --- Runtime stage ---
FROM node:24.21.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Re-declare ARG because ARG scope does not automatically cross FROM stages
ARG GIT_COMMIT=dev-build
ENV GIT_COMMIT=$GIT_COMMIT

COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "src/server.js"]