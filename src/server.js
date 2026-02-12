require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./utils/logger");

const { whatsappInit } = require("./whatsapp/client");
const routes = require("./routes");
const { sql } = require("./db/pg");
const { connection: redis } = require("./queue/redis");

const app = express();

// ── Segurança & parsing ──
app.use(cors());
app.use(express.json({ limit: "1mb" })); // limita body (evita payload gigante)

// ── Rotas ──
app.use(routes);

// ── Error handler global (impede crash por erros não tratados nas rotas) ──
app.use((err, req, res, _next) => {
    logger.error({ err, url: req.url, method: req.method }, "Erro não tratado na rota");
    res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3333;

let server;

(async () => {
    await whatsappInit();
    require("./queue/worker");
    server = app.listen(port, () => logger.info(`API rodando na porta ${port}`));
})();

// ── Graceful shutdown — fecha tudo limpo antes de parar ──
async function shutdown(signal) {
    logger.info(`${signal} recebido. Desligando...`);

    // 1. Para de aceitar novas requests
    if (server) {
        server.close(() => logger.info("HTTP server fechado"));
    }

    // 2. Fecha conexões
    try { await sql.end({ timeout: 5 }); logger.info("Postgres fechado"); } catch (_) {}
    try { redis.disconnect(); logger.info("Redis desconectado"); } catch (_) {}

    // 3. Encerra
    setTimeout(() => process.exit(0), 3000); // safety timeout
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Captura erros globais do processo (nunca crashar silenciosamente) ──
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException");
    process.exit(1); // PM2 reinicia
});

process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
    // não mata o processo, só loga
});

