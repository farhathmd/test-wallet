# Production image for the wallet API (NestJS + Prisma).
#
# Two stages, because the build needs the TypeScript toolchain and the runtime must not carry it:
#   * `build`  — installs everything, generates the Prisma client, compiles to dist/, then drops the
#                dev dependencies,
#   * `runtime`— copies only node_modules, dist and the Prisma schema/migrations.
#
# On start the container applies pending migrations and then serves. `prisma` is a production
# dependency for exactly that reason: a deployment must be able to migrate itself, and the CLI is the
# only supported way to apply Prisma migrations.
FROM node:24-slim AS build
WORKDIR /app
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

# `prisma generate` runs as an install hook here and reads prisma.config.ts, which resolves
# DATABASE_URL eagerly. A placeholder is enough to generate the client — nothing connects at build
# time — and the real connection string is supplied to the runtime stage below.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

# `node` is an unprivileged user that already exists in the official image.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/package.json ./
USER node

EXPOSE 4000
# A failing migration stops the container instead of serving against an out-of-date schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
