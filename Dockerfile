# ── Development mode (default) ──
# For production, use: docker build --target production -t sunnypanel .
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Development stage
FROM base AS development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# Production stage — requires PAYLOAD_SECRET and DATABASE_URL env vars
FROM base AS production
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
