#!/bin/bash
# ===========================================================
# LetsMarket — EC2 Server Setup Script
# ===========================================================
# Run this ONCE on a fresh Ubuntu 22.04/24.04 EC2 instance:
#
#   chmod +x scripts/setup-ec2.sh
#   sudo ./scripts/setup-ec2.sh
#
# What it does:
#   1. Installs Docker & Docker Compose plugin
#   2. Initialises Docker Swarm (single-node manager)
#   3. Creates the application directory
#   4. Obtains SSL certificates via Let's Encrypt / Certbot
#   5. Sets up automatic certificate renewal via cron
# ===========================================================

set -euo pipefail

DOMAIN="lezmarket.io"
EMAIL="admin@lezmarket.io"        # Let's Encrypt notification email
APP_DIR="/opt/letsmarket"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()     { echo -e "${BLUE}[SETUP]${NC} $1"; }
success() { echo -e "${GREEN}[✅]${NC} $1"; }
warn()    { echo -e "${YELLOW}[⚠️]${NC} $1"; }
error()   { echo -e "${RED}[❌]${NC} $1"; exit 1; }

# ─── Preflight ────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  error "Please run as root: sudo $0"
fi

log "Starting EC2 setup for ${DOMAIN}..."

# ─── 1. System updates ───────────────────────────────────
log "Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw

# ─── 2. Install Docker ───────────────────────────────────
if command -v docker &>/dev/null; then
  warn "Docker already installed — skipping"
else
  log "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list >/dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io \
                     docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  success "Docker installed"
fi

# Allow current non-root user to use docker
if [ -n "${SUDO_USER:-}" ]; then
  usermod -aG docker "${SUDO_USER}"
  log "Added ${SUDO_USER} to docker group (re-login required)"
fi

# ─── 3. Initialise Docker Swarm ──────────────────────────
if docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
  warn "Docker Swarm already active — skipping init"
else
  log "Initialising Docker Swarm..."
  # Use the instance's private IP for Swarm listen/advertise
  PRIVATE_IP=$(hostname -I | awk '{print $1}')
  docker swarm init --advertise-addr "${PRIVATE_IP}"
  success "Docker Swarm initialised (single-node manager)"
fi

# ─── 4. Create application directory ─────────────────────
log "Setting up application directory..."
mkdir -p "${APP_DIR}/nginx"
if [ -n "${SUDO_USER:-}" ]; then
  chown -R "${SUDO_USER}:${SUDO_USER}" "${APP_DIR}"
fi
success "App directory ready at ${APP_DIR}"

# ─── 5. Firewall ─────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow 2377/tcp   # Docker Swarm management
ufw allow 7946/tcp   # Swarm node communication
ufw allow 7946/udp
ufw allow 4789/udp   # Overlay network
ufw --force enable
success "Firewall configured"

# ─── 6. SSL certificates (Let's Encrypt) ─────────────────
log "Setting up SSL certificates..."
apt-get install -y certbot

# Create webroot for ACME challenge
mkdir -p /var/www/certbot

# Obtain certificate (standalone mode for first-time, before nginx is live)
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  log "Obtaining SSL certificate for ${DOMAIN}..."
  certbot certonly --standalone \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}" \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    --no-eff-email
  success "SSL certificate obtained"
else
  warn "SSL certificate already exists — skipping"
fi

# ─── 7. Certificate auto-renewal cron ────────────────────
log "Setting up SSL renewal cron..."
cat > /etc/cron.d/certbot-renew << 'EOF'
# Renew Let's Encrypt certs twice daily, reload nginx after
0 */12 * * * root certbot renew --webroot -w /var/www/certbot --quiet --deploy-hook "docker service update --force letsmarket_nginx" 2>&1 | logger -t certbot
EOF
chmod 644 /etc/cron.d/certbot-renew
success "Auto-renewal cron configured"

# ─── 8. Create docker volumes for certs ──────────────────
log "Creating Docker volumes for certificates..."
docker volume create --name certbot-etc \
  --opt type=none \
  --opt device=/etc/letsencrypt \
  --opt o=bind 2>/dev/null || true

docker volume create --name certbot-var \
  --opt type=none \
  --opt device=/var/lib/letsencrypt \
  --opt o=bind 2>/dev/null || true

docker volume create --name certbot-webroot \
  --opt type=none \
  --opt device=/var/www/certbot \
  --opt o=bind 2>/dev/null || true

success "Docker volumes created"

# ─── Done ─────────────────────────────────────────────────
echo ""
echo "============================================"
echo -e "${GREEN}  EC2 Setup Complete!${NC}"
echo "============================================"
echo ""
echo "  Domain:    ${DOMAIN}"
echo "  App Dir:   ${APP_DIR}"
echo "  Swarm:     Single-node manager"
echo "  SSL:       Let's Encrypt (auto-renewing)"
echo ""
echo "  Next steps:"
echo "  1. Copy docker-stack.yml and nginx/ to ${APP_DIR}"
echo "  2. Create ${APP_DIR}/.env.production with your secrets"
echo "  3. Set these GitHub Secrets:"
echo "     - EC2_HOST        (public IP or elastic IP)"
echo "     - EC2_USER        (ubuntu)"
echo "     - EC2_SSH_KEY     (contents of your .pem file)"
echo "     - APP_DIR         (${APP_DIR})"
echo "     - ENV_PRODUCTION  (contents of .env.production)"
echo "     - DOCKERHUB_USERNAME"
echo "     - DOCKERHUB_TOKEN"
echo "     - All NEXT_PUBLIC_* values"
echo "============================================"
