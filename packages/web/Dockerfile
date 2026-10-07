# Static web client served by nginx (also proxies /api and /socket.io to the server container)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/maps/package.json packages/maps/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/engine packages/engine
COPY packages/maps packages/maps
COPY packages/web packages/web
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @bt/web

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
