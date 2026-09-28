# syntax=docker/dockerfile:1
# Production image: install dependencies once in a builder stage, then ship only node_modules +
# source as a non-root user. Migrations and the admin seed run on boot (see src/server.js), so the
# container is self-sufficient against a fresh database.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
