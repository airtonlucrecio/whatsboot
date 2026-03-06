"use strict";

const pino = require("pino");

// Logger é importado antes do config em alguns módulos, portanto lê env diretamente aqui.
const isProduction = process.env.NODE_ENV === "production";

let transport;
if (!isProduction) {
    try {
        require.resolve("pino-pretty");
        transport = { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:mm:ss" } };
    } catch { // pino-pretty não está instalado, ignora
        // noop
    }
}

const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    transport,
});

module.exports = logger;
