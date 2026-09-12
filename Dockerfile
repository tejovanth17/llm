# ==============================================================================
# Multi-stage Dockerfile for Global Production Deployment of AetherAI
# ==============================================================================

# Stage 1: Build the Vite Frontend
FROM node:20-alpine AS builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies for server
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy backend application
COPY server/ ./server/

# Copy built frontend assets to server/public
COPY --from=builder /app/client/dist ./server/public

# Ensure database directory exists with proper permissions
RUN mkdir -p /app/server/data && chown -R node:node /app

USER node

EXPOSE 8080

CMD ["node", "server/server.js"]
