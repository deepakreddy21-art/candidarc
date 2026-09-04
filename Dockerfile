# Build stage uses demo SESSION_SECRET via isBuildPhase() — production secrets are validated at runtime (web start / worker).
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV APP_MODE=demo
ENV NEXT_PUBLIC_APP_MODE=demo
RUN npm run build

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]

FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["npm", "run", "worker"]
