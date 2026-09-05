# Build stage uses demo SESSION_SECRET via isBuildPhase() — production secrets are validated at runtime (web start / worker).
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
# Client demo seed stripping requires production public mode for production images.
ARG NEXT_PUBLIC_APP_MODE=production
ARG APP_MODE=production
ENV NEXT_PUBLIC_APP_MODE=$NEXT_PUBLIC_APP_MODE
ENV APP_MODE=$APP_MODE
RUN npm run build

FROM node:22-bookworm-slim AS playwright-deps
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
RUN npx playwright install --with-deps chromium

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]

FROM playwright-deps AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
COPY --from=playwright-deps /root/.cache/ms-playwright /root/.cache/ms-playwright
CMD ["npm", "run", "worker"]
