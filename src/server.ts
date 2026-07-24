import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import diagnosisRoutes from "./routes/diagnoses";
import deviceRoutes from "./routes/devices";
import alertRoutes from "./routes/alerts";
import analyticsRoutes from "./routes/analytics";
import { rateLimiter } from "./middleware/rateLimit";
import logger from "./utils/logger";
import { checkAndCreateAlerts } from "./controllers/AlertsController";

dotenv.config();

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // Allow external fonts/styles for landing page
app.use(cors({ origin: "*" })); // tighten in production
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(rateLimiter);

// ── Serve Static Landing Page ─────────────────────────────────────────────────
const publicDir = path.join(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  const indexPath = path.join(__dirname, "../public/index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      name: "Malaria AI Field Diagnostic System API",
      status: "online",
      healthCheck: "/health",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/diagnoses", diagnosisRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/analytics", analyticsRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
const startedAt = Date.now();
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    version: "1.0.0",
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function start() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("MONGODB_URI is not set in .env");

    await mongoose.connect(mongoUri);
    logger.info("MongoDB connected");

    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);

      // Run outbreak check every 15 minutes
      setInterval(
        async () => {
          try {
            const fakeReq = {} as any;
            const fakeRes = {
              json: (d: any) =>
                logger.info(
                  `Scheduled outbreak check: ${d.alertsCreated} alerts created`,
                ),
            } as any;
            await checkAndCreateAlerts(fakeReq, fakeRes);
          } catch (err) {
            logger.error("Scheduled outbreak check failed", err);
          }
        },
        15 * 60 * 1000,
      );
    });
  } catch (err) {
    logger.error("Failed to start server", err);
    process.exit(1);
  }
}

start();
