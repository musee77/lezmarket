# Dockerfile for Next.js application
# Multi-stage build for optimized production image

# =========================================
# Stage 1: Dependencies
# =========================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# =========================================
# Stage 2: Builder
# =========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ---- Build-time args (injected by GitHub Actions) ----
# These MUST be declared as ARG so docker build --build-arg works.
# They are then set as ENV so `next build` can inline them.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID
ARG NEXT_PUBLIC_X_CLIENT_ID
ARG NEXT_PUBLIC_LINKEDIN_CLIENT_ID
ARG NEXT_PUBLIC_TIKTOK_CLIENT_ID
ARG NEXT_PUBLIC_FACEBOOK_CLIENT_ID
ARG NEXT_PUBLIC_THREADS_CLIENT_ID
ARG NEXT_PUBLIC_REDDIT_CLIENT_ID

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=$NEXT_PUBLIC_GITHUB_CLIENT_ID
ENV NEXT_PUBLIC_X_CLIENT_ID=$NEXT_PUBLIC_X_CLIENT_ID
ENV NEXT_PUBLIC_LINKEDIN_CLIENT_ID=$NEXT_PUBLIC_LINKEDIN_CLIENT_ID
ENV NEXT_PUBLIC_TIKTOK_CLIENT_ID=$NEXT_PUBLIC_TIKTOK_CLIENT_ID
ENV NEXT_PUBLIC_FACEBOOK_CLIENT_ID=$NEXT_PUBLIC_FACEBOOK_CLIENT_ID
ENV NEXT_PUBLIC_THREADS_CLIENT_ID=$NEXT_PUBLIC_THREADS_CLIENT_ID
ENV NEXT_PUBLIC_REDDIT_CLIENT_ID=$NEXT_PUBLIC_REDDIT_CLIENT_ID

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN corepack enable pnpm && pnpm run build

# =========================================
# Stage 3: Runner (Production)
# =========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
