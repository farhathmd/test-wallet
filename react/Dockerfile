# syntax=docker/dockerfile:1
# Two stages: build the static bundle with Node, then serve it with nginx.
# VITE_API_URL is a build argument because Vite bakes environment values into the bundle at build time.
FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
