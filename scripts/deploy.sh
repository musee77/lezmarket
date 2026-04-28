#!/bin/bash
# ===========================================
# LetsMarket - Docker Compose Deployment Script
# ===========================================
# Usage: ./scripts/deploy.sh [tag]
#   tag: Docker image tag to deploy (default: latest)
#
# Run manually on the EC2 instance or called
# by the GitHub Actions deploy workflow.
# ===========================================

set -euo pipefail

DOCKERHUB_USER="${DOCKERHUB_USERNAME:-musee77}"
IMAGE_NAME="lezmarket"
TAG="${1:-latest}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
HEALTH_URL="http://localhost:3000/api/health"
HEALTH_RETRIES=12
HEALTH_DELAY=10

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
success() { echo -e "${GREEN}[✅]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠️]${NC} $1"; }
error() { echo -e "${RED}[❌]${NC} $1"; }

log "Deploying ${DOCKERHUB_USER}/${IMAGE_NAME}:${TAG} to lezmarket.io"
cd "${APP_DIR}"

# Preflight checks
if [ ! -f ".env.production" ]; then
  error ".env.production not found in ${APP_DIR}"
  exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
  error "docker-compose.yml not found in ${APP_DIR}"
  exit 1
fi

# Pull image
log "Pulling image from Docker Hub..."
docker pull "${DOCKERHUB_USER}/${IMAGE_NAME}:${TAG}"
success "Image pulled"

# Deploy with Docker Compose
log "Deploying with Docker Compose..."
export DOCKER_REGISTRY=""
export IMAGE_NAME="${DOCKERHUB_USER}/${IMAGE_NAME}"
export TAG
docker compose -f docker-compose.yml up -d --pull always --remove-orphans
success "Containers updated"

# Health check
log "Running health checks..."
HEALTHY=false

for i in $(seq 1 ${HEALTH_RETRIES}); do
  sleep ${HEALTH_DELAY}
  RESPONSE=$(curl -sf "${HEALTH_URL}" 2>/dev/null || echo "")
  if echo "${RESPONSE}" | grep -q "healthy"; then
    HEALTHY=true
    success "Health check passed (attempt ${i}/${HEALTH_RETRIES})"
    break
  else
    warn "Attempt ${i}/${HEALTH_RETRIES} - waiting..."
  fi
done

if [ "${HEALTHY}" = true ]; then
  success "🎉 lezmarket.io is live!"
  docker image prune -f > /dev/null 2>&1
  echo ""
  log "====== Deployment Summary ======"
  log "Image:  ${IMAGE_NAME}:${TAG}"
  log "Mode:   Docker Compose"
  log "Domain: lezmarket.io"
  log "Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  log "================================"
else
  error "Health check failed after ${HEALTH_RETRIES} attempts!"
  warn "Service status:"
  docker compose -f docker-compose.yml ps
  docker compose -f docker-compose.yml logs --tail 30 app
  echo ""
  warn "Restarting containers..."
  docker compose -f docker-compose.yml restart app 2>/dev/null || true
  error "Check logs: docker compose -f docker-compose.yml logs -f app"
  exit 1
fi
