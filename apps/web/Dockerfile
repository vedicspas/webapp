# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=apps/web
COPY apps/web apps/web

# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4100
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN=
ARG NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN=$NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN \
    NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=$NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN \
    NEXT_TELEMETRY_DISABLED=1

# The API is not reachable during image build; pages fall back to empty data
# and fill in via ISR revalidation at runtime.
RUN npm run build --workspace=apps/web

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
