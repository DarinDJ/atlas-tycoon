# Bharat Tycoon game server
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/maps/package.json packages/maps/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/engine packages/engine
COPY packages/maps packages/maps
COPY packages/server packages/server
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0 DB_PATH=/data/bharat.db
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
