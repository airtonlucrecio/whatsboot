const config = require("./config"); // carrega dotenv + valida env vars
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./utils/logger");
const { requestId } = require("./middleware/requestId");
const { AppError } = require("./utils/errors");

const { whatsappInit } = require("./whatsapp/client");
const routes = require("./routes");
const { sql } = require("./db/pg");
const { connection: redis } = require("./queue/redis");

const app = express();

/* ─── TRUST PROXY (X-Forwarded-For correto atrás de nginx/railway) ─── */
app.set("trust proxy", 1);

/* ─── REQUEST ID ─── */
app.use(requestId);

/* ─── SECURITY ─── */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
}));

app.disable("x-powered-by");

/* ─── RATE LIMITING ─── */
const apiLimiter = rateLimit({
    windowMs: config.apiRateLimitWindowMs,
    max: config.apiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers["x-api-key"] || req.ip,
    message: { error: "too_many_requests", message: "Tente novamente em 1 minuto" },
    skip: (req) => req.path === "/healthz" || req.path === "/health",
});

app.use(apiLimiter);

/* ─── MIDDLEWARE ─── */
app.use(cors({
    origin: config.corsOrigin.split(",").map((o) => o.trim()),
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-Api-Key", "X-Request-Id"],
}));
app.use(express.json({ limit: "1mb" }));

app.use(routes);

/* ─── ERROR HANDLER GLOBAL ─── */
app.use((err, req, res, _next) => {
    if (err instanceof AppError) {
        logger.warn({ err, url: req.url, method: req.method, requestId: req.id }, err.message);
        return res.status(err.statusCode).json(err.toJSON());
    }
    logger.error({ err, url: req.url, method: req.method, requestId: req.id }, "Erro não tratado na rota");
    return res.status(500).json({ error: "internal_server_error" });
});

let server;

(async () => {
    const { createWorker } = require("./queue/worker");
    const { closeWorker } = createWorker();

    server = app.listen(config.port, () => logger.info(`API rodando na porta ${config.port}`));

    // Registra closeWorker para usar no shutdown
    app.locals.closeWorker = closeWorker;

    whatsappInit().catch(err => logger.error({ err }, "Falha ao iniciar WhatsApp"));
})();

async function shutdown(signal) {
    logger.info(`${signal} recebido. Desligando...`);

    await new Promise((resolve) => {
        if (server) {
            server.close(() => {
                logger.info("HTTP server fechado");
                resolve();
            });
        } else {
            resolve();
        }
    });

    // Encerra o worker do BullMQ (para de pegar novos jobs)
    try {
        if (app.locals.closeWorker) await app.locals.closeWorker();
    } catch (err) { logger.warn({ err: err.message }, "Erro ao fechar worker"); }

    try { await sql.end({ timeout: 5 }); logger.info("Postgres fechado"); } catch (err) { logger.warn({ err: err.message }, "Erro ao fechar Postgres"); }
    try { redis.disconnect(); logger.info("Redis desconectado"); } catch (err) { logger.warn({ err: err.message }, "Erro ao desconectar Redis"); }

    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException");
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
});

