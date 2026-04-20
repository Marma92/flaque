FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

RUN npm ci

COPY shared shared
COPY backend backend

RUN npm run build --workspace backend \
  && npm prune --omit=dev --workspaces --include-workspace-root


FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_ROOT=/app/data

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 4000

CMD ["node", "backend/dist/server.js"]
