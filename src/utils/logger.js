const pino = require("pino");

let transport;
if (process.env.NODE_ENV !== "production") {
    try {
        require.resolve("pino-pretty");
        transport = { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } };
    } catch (_) {
        // pino-pretty não está instalado, ignora
    }
}

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport,
});

module.exports = logger;
