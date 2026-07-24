#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Malaria AI Backend — one-command setup
#  Usage: chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}▶ Malaria AI Backend Setup${NC}\n"

# 1. Check dependencies
echo "Checking dependencies..."
command -v node  >/dev/null 2>&1 || { echo -e "${RED}✗ Node.js not found. Install from https://nodejs.org${NC}"; exit 1; }
command -v npm   >/dev/null 2>&1 || { echo -e "${RED}✗ npm not found.${NC}"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}✗ Docker not found. Install from https://docker.com${NC}"; exit 1; }
echo -e "${GREEN}✓ All dependencies present${NC}\n"

# 2. Ensure .env exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${YELLOW}⚠ Created .env from .env.example — edit ADMIN_API_KEY, JWT_SECRET, and Mongo credentials before continuing${NC}"
  exit 0
fi

# 3. Start MongoDB via Docker
echo "Starting MongoDB..."
docker compose up -d mongodb
echo "Waiting for MongoDB to be ready..."
sleep 8
echo -e "${GREEN}✓ MongoDB running on port 27017${NC}\n"

# 4. Install Node dependencies
echo "Installing dependencies..."
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}\n"

# 5. Build TypeScript
echo "Building TypeScript..."
npm run build
echo -e "${GREEN}✓ Build complete${NC}\n"

# 6. Start the server
echo -e "${GREEN}▶ Starting backend server...${NC}"
npm start &
SERVER_PID=$!
sleep 3

# 7. Health check
HEALTH=$(curl -s http://localhost:3000/health || echo "error")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "\n${GREEN}✓ Server is running!${NC}"
  echo -e "${GREEN}✓ MongoDB is connected${NC}\n"
  echo "─────────────────────────────────────────────"
  echo "  API URL:    http://localhost:3000"
  echo "  Health:     http://localhost:3000/health"
  echo "─────────────────────────────────────────────"
  echo ""
  echo "Available endpoints:"
  echo "  POST /api/diagnoses/sync     — sync diagnoses from app"
  echo "  GET  /api/diagnoses          — list diagnoses"
  echo "  GET  /api/diagnoses/stats    — analytics"
  echo "  GET  /api/diagnoses/heatmap  — heatmap data"
  echo "  GET  /api/analytics/dashboard — dashboard stats"
  echo "  GET  /api/analytics/trends   — case trends + forecast"
  echo "  GET  /api/analytics/export   — CSV/JSON/GeoJSON export"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Configure the mobile app's Settings tab with this server URL"
  echo "  2. Use the API key from your .env (ADMIN_API_KEY)"
  echo "  3. To deploy: run  docker compose up -d  (starts both MongoDB + backend)"
else
  echo -e "${RED}✗ Server health check failed. Check logs above.${NC}"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

wait $SERVER_PID
