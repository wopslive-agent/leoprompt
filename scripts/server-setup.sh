#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 VPS.
# Run as root or with sudo: sudo bash scripts/server-setup.sh
set -euo pipefail

APP_USER="${APP_USER:-leoprompt}"
APP_DIR="/home/$APP_USER/app"
REPO_URL="${REPO_URL:-}"   # e.g. https://github.com/yourname/leoprompt-clean.git
DB_NAME="leoprompt"
DB_USER="leoprompt"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"

# ── System ──────────────────────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban nginx certbot python3-certbot-nginx

# ── Node.js 22 ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

# ── pnpm ────────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
fi
pnpm -v

# ── PM2 ─────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi
pm2 -v

# ── MySQL ────────────────────────────────────────────────────────────────────
if ! command -v mysql &>/dev/null; then
  apt-get install -y mysql-server
  systemctl enable --now mysql
fi

mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
echo ""
echo "MySQL database '$DB_NAME' and user '$DB_USER' created."
echo "  DATABASE_URL=mysql://$DB_USER:$DB_PASS@127.0.0.1:3306/$DB_NAME"
echo ""

# ── App user ─────────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
fi

# ── Clone repo ───────────────────────────────────────────────────────────────
if [ -n "$REPO_URL" ]; then
  if [ ! -d "$APP_DIR/.git" ]; then
    sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
  fi
  echo "Repo cloned to $APP_DIR"
else
  echo "REPO_URL not set — skipping clone. Clone manually to $APP_DIR"
fi

# ── Firewall ─────────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status

# ── nginx site ────────────────────────────────────────────────────────────────
if [ -f "/home/$APP_USER/app/config/nginx.conf" ]; then
  cp "/home/$APP_USER/app/config/nginx.conf" /etc/nginx/sites-available/leoprompt
  ln -sf /etc/nginx/sites-available/leoprompt /etc/nginx/sites-enabled/leoprompt
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "nginx configured from config/nginx.conf"
else
  echo "config/nginx.conf not found — configure nginx manually or run this after cloning."
fi

# ── PM2 startup ──────────────────────────────────────────────────────────────
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true

echo ""
echo "=========================================="
echo "Server setup complete."
echo "Next steps:"
echo "  1. cp $APP_DIR/.env.example $APP_DIR/.env"
echo "  2. nano $APP_DIR/.env   (fill in all required values)"
echo "  3. Update config/nginx.conf with your domain"
echo "  4. sudo certbot --nginx -d yourdomain.com"
echo "  5. sudo -u $APP_USER bash $APP_DIR/scripts/deploy.sh"
echo "=========================================="
