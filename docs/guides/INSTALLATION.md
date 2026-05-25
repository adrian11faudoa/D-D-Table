# MythicForge VTT — Installation Guide

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10, macOS 12, Ubuntu 22 | Windows 11, macOS 14, Ubuntu 24 |
| CPU | 4-core, 2.5 GHz | 8-core, 3.5 GHz |
| RAM | 8 GB | 16 GB |
| GPU | Any with WebGL 2.0 | Dedicated GPU, 4 GB VRAM |
| Storage | 2 GB | SSD, 10 GB |
| Network | 5 Mbps | 25 Mbps (for hosting) |
| Node.js | 20.0+ | 22.0 LTS |

---

## Method 1: Desktop App (Recommended)

The desktop app bundles everything — no separate server setup needed.

### Windows

```bash
# Download the installer
curl -LO https://releases.mythicforge.io/latest/MythicForge-VTT-Setup.exe

# Run the installer
MythicForge-VTT-Setup.exe

# Or via winget
winget install MythicForge.VTT
```

The installer will:
- Install MythicForge VTT to `%LOCALAPPDATA%\MythicForge VTT`
- Create a desktop and Start Menu shortcut
- Start an embedded server automatically when the app launches

**Data is stored at:** `%APPDATA%\MythicForge VTT\`

### macOS

```bash
# Download the DMG
curl -LO https://releases.mythicforge.io/latest/MythicForge-VTT.dmg

# Mount and drag to Applications
open MythicForge-VTT.dmg

# Or via Homebrew
brew install --cask mythicforge-vtt
```

**Data is stored at:** `~/Library/Application Support/MythicForge VTT/`

### Linux

```bash
# AppImage
curl -LO https://releases.mythicforge.io/latest/MythicForge-VTT.AppImage
chmod +x MythicForge-VTT.AppImage
./MythicForge-VTT.AppImage

# Debian/Ubuntu
curl -LO https://releases.mythicforge.io/latest/mythicforge-vtt_amd64.deb
sudo dpkg -i mythicforge-vtt_amd64.deb

# RPM (Fedora/RHEL)
curl -LO https://releases.mythicforge.io/latest/mythicforge-vtt.x86_64.rpm
sudo rpm -i mythicforge-vtt.x86_64.rpm
```

**Data is stored at:** `~/.config/MythicForge VTT/`

---

## Method 2: Self-Hosted Server

For hosting online sessions accessible from anywhere.

### Prerequisites

```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install nodejs

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Install from Source

```bash
# Clone repository
git clone https://github.com/mythicforge/vtt.git
cd vtt

# Install dependencies
npm install

# Configure environment
cp apps/server/.env.example apps/server/.env
nano apps/server/.env
```

**`.env` configuration:**
```env
PORT=3000
JWT_SECRET=change-this-to-a-random-64-char-string
DATABASE_URL=file:./data/mythicforge.db
NODE_ENV=production
ASSETS_DIR=./public/assets
UPLOADS_DIR=./public/uploads
MAX_UPLOAD_MB=50
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
# Build all packages
npm run build

# Start the server
npm run start:server
```

Open `http://localhost:3000` in your browser. Create an account and start hosting!

---

## Method 3: Docker

### Quick Start

```bash
docker run -d \
  --name mythicforge \
  -p 3000:3000 \
  -v mythicforge-data:/data \
  -e JWT_SECRET=your-secret-here \
  mythicforge/vtt:latest
```

### Docker Compose (Recommended)

```bash
curl -LO https://raw.githubusercontent.com/mythicforge/vtt/main/docker-compose.yml
nano docker-compose.yml   # Edit JWT_SECRET

docker compose up -d
docker compose logs -f
```

### Reverse Proxy (nginx)

For HTTPS and a custom domain:

```nginx
server {
    listen 80;
    server_name vtt.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vtt.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/vtt.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vtt.yourdomain.com/privkey.pem;

    # Large file uploads (maps, assets)
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running connections
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Get a free SSL certificate:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d vtt.yourdomain.com
```

---

## Network Setup for Online Play

### Port Forwarding (Home Server)

Open port **3000** (or your configured port) in your router:

1. Find your local IP: `ip route get 1.1.1.1 | awk '{print $7}'`
2. Log into your router (usually 192.168.1.1)
3. Navigate to Port Forwarding / Virtual Servers
4. Add rule: External 3000 → Internal [your-local-ip]:3000
5. Share your public IP with players: `curl ifconfig.me`

### Cloudflare Tunnel (No Port Forwarding)

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Create a free tunnel
cloudflared tunnel --url http://localhost:3000
# Returns: https://random-name.trycloudflare.com
```

Share the `trycloudflare.com` URL with players — no account needed!

### Tailscale (Secure LAN Extension)

For playing with friends securely without public exposure:

```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Share your Tailscale IP
tailscale ip -4
```

Players join your Tailscale network, then connect to your Tailscale IP.

---

## Database Options

### SQLite (Default)

Perfect for single-server deployments up to ~50 concurrent users.

```env
DATABASE_URL=file:./data/mythicforge.db
```

### PostgreSQL (Production)

For larger deployments, high availability, or multiple server instances:

```bash
# Install PostgreSQL
sudo apt install postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE mythicforge;
CREATE USER mythicforge WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE mythicforge TO mythicforge;
\q
```

```env
DATABASE_URL=postgresql://mythicforge:your-password@localhost:5432/mythicforge
```

---

## Building from Source

### Development Mode

```bash
# Terminal 1: Backend
cd apps/server
npm run dev
# Server runs at http://localhost:3000

# Terminal 2: Frontend
cd apps/client
npm run dev
# Vite dev server at http://localhost:5173
```

Changes to TypeScript files hot-reload automatically.

### Production Build

```bash
npm run build

# Test the production build
cd apps/server && node dist/index.js
```

### Desktop App Build

```bash
cd apps/desktop

# Development
npm run dev

# Package for current platform
npm run package:win    # Windows .exe installer
npm run package:mac    # macOS .dmg
npm run package:linux  # Linux .AppImage + .deb + .rpm
```

Output is in `apps/desktop/release/`.

---

## Installing Plugins

### Via Plugin Manager (UI)

1. Launch MythicForge VTT
2. Click ⚙ Settings → Plugins → Browse Marketplace
3. Find your plugin, click Install
4. Reload the application

### Manual Installation

```bash
# For self-hosted server
cd /path/to/mythicforge

# Extract plugin zip
mkdir -p plugins/my-plugin
unzip my-plugin-v1.0.0.zip -d plugins/my-plugin

# Restart the server
# The plugin will load automatically on next startup
```

### From URL (Desktop App)

In the Plugin Manager, click "Install from URL" and paste the `.zip` URL.

---

## Upgrading

### Desktop App

Auto-updates check automatically. Or download the new installer manually.

### Server (npm)

```bash
git pull origin main
npm install
npm run build
pm2 restart mythicforge   # or: systemctl restart mythicforge
```

### Docker

```bash
docker pull mythicforge/vtt:latest
docker compose up -d
```

---

## Running as a Service

### systemd (Linux)

```ini
# /etc/systemd/system/mythicforge.service
[Unit]
Description=MythicForge VTT Server
After=network.target

[Service]
Type=simple
User=mythicforge
WorkingDirectory=/opt/mythicforge
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/mythicforge/.env
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable mythicforge
sudo systemctl start mythicforge
sudo systemctl status mythicforge
```

### PM2 (Node.js Process Manager)

```bash
npm install -g pm2

pm2 start apps/server/dist/index.js --name mythicforge
pm2 save
pm2 startup   # follow instructions
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 3000
sudo lsof -i :3000
# Kill it
kill -9 <PID>
# Or change port in .env
PORT=3001
```

### Database Permission Error

```bash
chmod 755 ./data
chmod 644 ./data/mythicforge.db
```

### WebSocket Connection Refused

- Ensure port is open in firewall: `sudo ufw allow 3000`
- Check nginx WebSocket headers (see Reverse Proxy section)
- Verify `proxy_read_timeout` is set to a high value

### Players Can't Connect

1. Confirm your public IP is correct: `curl ifconfig.me`
2. Verify port forwarding is active
3. Test connectivity: `curl http://YOUR_IP:3000/api/health`
4. Check server logs: `journalctl -u mythicforge -f`

### High Memory Usage

```bash
# Check process memory
ps aux | grep node
# Set Node.js max memory (in .env or start command)
NODE_OPTIONS=--max-old-space-size=2048 node dist/index.js
```

---

## Getting Help

- **Documentation:** https://docs.mythicforge.io
- **Discord:** https://discord.gg/mythicforge
- **GitHub Issues:** https://github.com/mythicforge/vtt/issues
- **Reddit:** r/MythicForgeVTT

---

*MythicForge VTT Installation Guide v0.1.0*
