# Malaria AI — Backend

Node.js + Express + MongoDB backend for the Malaria AI field diagnostic app.

---

## Quick Start

### Prerequisites
- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1. Configure environment
```bash
cp .env.example .env
# edit .env: set ADMIN_API_KEY, JWT_SECRET, MONGO_ROOT_PASS / MONGODB_URI
```

### 2. Run setup
```bash
chmod +x setup.sh
./setup.sh
```

Server runs at **http://localhost:3000**.

---

## Manual Setup

```bash
docker compose up -d mongodb
npm install
npm run build
npm start
```

For development with auto-reload:
```bash
npm run dev
```

---

## Project Structure

```
malaria-ai-backend/
├── src/
│   ├── server.ts                  # Entry point, Express setup, scheduler
│   ├── controllers/
│   │   ├── DiagnosisController.ts # Sync, list, stats, heatmap
│   │   ├── DeviceController.ts    # Register, list, ping
│   │   ├── AlertsController.ts    # Alerts list/ack/delete, outbreak detection
│   │   └── AnalyticsController.ts # Dashboard, trends+forecast, heatmap, rankings, export
│   ├── services/
│   │   ├── AlertService.ts        # Outbreak detection + SMS/email notifications
│   │   ├── HeatmapService.ts      # Heatmap aggregation + reverse geocoding + risk score
│   │   └── ExportService.ts       # CSV / GeoJSON export
│   ├── models/
│   │   ├── Diagnosis.ts
│   │   ├── Device.ts
│   │   └── Alert.ts
│   ├── routes/
│   │   ├── diagnoses.ts
│   │   ├── devices.ts
│   │   ├── alerts.ts
│   │   └── analytics.ts
│   ├── middleware/
│   │   ├── auth.ts                # API key validation
│   │   └── rateLimit.ts
│   └── utils/
│       └── logger.ts
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
└── setup.sh
```

---

## API Reference

All endpoints require the header:
```
X-API-Key: <ADMIN_API_KEY from .env>
```

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server + DB status, uptime |

### Diagnoses

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/diagnoses/sync` | Batch upload diagnoses from device |
| GET | `/api/diagnoses` | List diagnoses (paginated) |
| GET | `/api/diagnoses/stats` | Aggregated statistics |
| GET | `/api/diagnoses/heatmap` | Geographic heatmap data |

### Devices

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/devices/register` | Register or update a device |
| GET | `/api/devices` | List all devices |
| GET | `/api/devices/:deviceId` | Device detail + recent activity |
| PATCH | `/api/devices/:deviceId` | Update device info |
| POST | `/api/devices/:deviceId/ping` | Heartbeat / mark as active |

### Alerts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alerts` | List alerts (filter by acknowledged, severity, district) |
| POST | `/api/alerts/check-outbreak` | Manually trigger outbreak check (also sends SMS/email) |
| POST | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| DELETE | `/api/alerts/:id` | Delete an alert |

Outbreak alerts fire automatically every 15 minutes. When created, `AlertService`
sends SMS (Twilio) and/or email (SMTP) notifications to active health workers
in the affected district, if those env vars are configured.

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/dashboard` | Summary stats: cases, devices, alerts, top districts |
| GET | `/api/analytics/trends` | Time-series trends with forecast (`?days=&granularity=day\|week\|month`) |
| GET | `/api/analytics/heatmap` | Fine/coarse-grained heatmap with risk intensity |
| GET | `/api/analytics/districts/ranking` | District ranking by cases or avg parasite density |
| GET | `/api/analytics/export` | Export diagnoses as `csv`, `json`, or `geojson` |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MONGODB_URI` | *(required)* | MongoDB connection string |
| `JWT_SECRET` | *(required)* | Secret for JWT signing |
| `ADMIN_API_KEY` | *(required)* | API key for all endpoints |
| `POSITIVE_ALERT_THRESHOLD` | `10` | Positive cases/24h to trigger outbreak alert |
| `TWILIO_ACCOUNT_SID` | *(optional)* | Twilio SID for SMS alerts |
| `TWILIO_AUTH_TOKEN` | *(optional)* | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | *(optional)* | Twilio sender number |
| `SMTP_HOST` | *(optional)* | SMTP host for email alerts |
| `SMTP_PORT` | *(optional)* | SMTP port |
| `SMTP_USER` | *(optional)* | SMTP username |
| `SMTP_PASS` | *(optional)* | SMTP password |

---

## Production Deployment

```bash
nano .env   # set ADMIN_API_KEY, JWT_SECRET, MONGO_ROOT_PASS

docker compose up -d
docker compose logs -f backend
```

For a VPS: install Docker, copy project files, update `.env`, `docker compose up -d`,
then put nginx + Certbot in front of port 3000.

---

## Bug Fixes Incorporated

- `AnalyticsController.ts` — added missing `Request`/`Response` imports from `express`.
- `HeatmapService.ts` — added missing `axios` import for `reverseGeocode()`.
- `AlertService.ts` — added missing `Request`/`Response`/`IAlert` imports; `sendAlertNotifications`
  made public so `AlertsController` can trigger SMS/email on outbreak detection.

---

## ⚕ Medical Disclaimer

This system is a screening aid only. All positive results must be confirmed
by a qualified healthcare professional. Do not use as a sole basis for
treatment decisions.
