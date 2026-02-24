const IORedis = require("ioredis");
const logger = require("../utils/logger");

const redisUrl = process.env.REDIS_URL;

// BullMQ exige conexões separadas para Queue e Worker (Worker usa BLPOP bloqueante)
function createRedisConnection() {
    const conn = redisUrl
        ? new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            retryStrategy(times) {
                const delay = Math.min(times * 500, 10000);
                logger.warn(`Redis reconectando em ${delay}ms (tentativa ${times})`);
                return delay;
            },
        })
        : new IORedis({
            host: process.env.REDIS_HOST || "localhost",
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            retryStrategy(times) {
                const delay = Math.min(times * 500, 10000);
                logger.warn(`Redis reconectando em ${delay}ms (tentativa ${times})`);
                return delay;
            },
        });

    return conn;
}

// Conexão principal usada no servidor para monitorar o Redis
const connection = createRedisConnection();
connection.on("connect", () => logger.info("Redis conectado"));
connection.on("error", (err) => logger.error({ err: err.message }, "Erro Redis"));

module.exports = { connection, createRedisConnection };