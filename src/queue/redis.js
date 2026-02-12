const IORedis = require("ioredis");
const logger = require("../utils/logger");

const redisUrl = process.env.REDIS_URL;

const connection = redisUrl
    ? new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        retryStrategy(times) {
            const delay = Math.min(times * 500, 10000); // tenta reconectar com backoff até 10s
            logger.warn(`Redis reconectando em ${delay}ms (tentativa ${times})`);
            return delay;
        },
    })
    : new IORedis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        retryStrategy(times) {
            const delay = Math.min(times * 500, 10000); // tenta reconectar com backoff até 10s
            logger.warn(`Redis reconectando em ${delay}ms (tentativa ${times})`);
            return delay;
        },
    });

connection.on("connect", () => logger.info("Redis conectado"));
connection.on("error", (err) => logger.error({ err: err.message }, "Erro Redis"));

module.exports = { connection };