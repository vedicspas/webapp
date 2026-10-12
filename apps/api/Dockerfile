# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=apps/api
# Copy sources only so workspace node_modules (sharp) are not overwritten.
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
# Node 22 loads packages/shared/src/index.ts natively but does not map
# "./reviews.js" → reviews.ts. Emit a JS sibling for the production image.
RUN npm run build --workspace=apps/api \
    && npx tsc --module ESNext --target ES2022 --skipLibCheck --declaration false packages/shared/src/reviews.ts \
    && npm prune --omit=dev \
    && mkdir -p apps/api/node_modules

FROM node:22-alpine
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/package.json package.json
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
RUN mkdir -p /data/uploads/reviews /repo/uploads/reviews
EXPOSE 4100
CMD ["node", "apps/api/dist/index.js"]
