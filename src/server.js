require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./utils/logger");

const { whatsappInit } = require("./whatsapp/client");
const routes = require("./routes");
const { sql } = require("./db/pg");
const { connection: redis } = require("./queue/redis");

const app = express();

/* ─── SECURITY ─── */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.disable("x-powered-by");

/* ─── RATE LIMITING ─── */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", message: "Tente novamente em 1 minuto" },
    skip: (req) => req.path === "/healthz" || req.path === "/health",
});

app.use(apiLimiter);

/* ─── MIDDLEWARE ─── */
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ─── STATIC FILES ─── */
const path = require("path");
app.use(express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    etag: true,
}));

app.use(routes);

app.use((err, req, res, _next) => {
    logger.error({ err, url: req.url, method: req.method }, "Erro não tratado na rota");
    res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3333;

let server;

(async () => {
    require("./queue/worker");
    server = app.listen(port, () => logger.info(`API rodando na porta ${port}`));

    whatsappInit().catch(err => logger.error({ err }, "Falha ao iniciar WhatsApp"));
})();

async function shutdown(signal) {
    logger.info(`${signal} recebido. Desligando...`);

    if (server) {
        server.close(() => logger.info("HTTP server fechado"));
    }

    try { await sql.end({ timeout: 5 }); logger.info("Postgres fechado"); } catch (_) { }
    try { redis.disconnect(); logger.info("Redis desconectado"); } catch (_) { }

    setTimeout(() => process.exit(0), 3000); 
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

