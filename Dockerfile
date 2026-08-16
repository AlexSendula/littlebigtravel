# syntax=docker/dockerfile:1

# ---- Stage 1: build the static bundle ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies from the lockfile only, so the layer caches until
# package.json or package-lock.json actually change.
COPY package.json package-lock.json ./
RUN npm ci

# Build. `npm run build` runs `tsc -b && vite build`, so devDependencies are
# required here — this stage is discarded and never shipped.
COPY . .
RUN npm run build

# ---- Stage 2: serve ----
# nginx-unprivileged runs as a non-root user (uid 101) and listens on 8080,
# since an unprivileged process cannot bind port 80.
FROM nginxinc/nginx-unprivileged:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# No Node runtime in the final image — this only serves static files.
