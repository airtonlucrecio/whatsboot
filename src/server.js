require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./utils/logger");

const { whatsappInit } = require("./whatsapp/client");
const routes = require("./routes");
const { sql } = require("./db/pg");
const { connection: redis } = require("./queue/redis");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" })); 

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

