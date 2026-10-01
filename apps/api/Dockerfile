# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=apps/api
COPY apps/api apps/api
RUN npm run build --workspace=apps/api \
  && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
RUN mkdir -p /repo/uploads/reviews
EXPOSE 4100
CMD ["node", "apps/api/dist/index.js"]
