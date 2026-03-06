"use strict";

const IORedis = require("ioredis");
const config = require("../config");
const logger = require("../utils/logger");

const RETRY_CEILING_MS = 10_000;
const RETRY_STEP_MS = 500;

/** Estratégia de reconexão exponencial com teto */
function retryStrategy(times) {
    const delay = Math.min(times * RETRY_STEP_MS, RETRY_CEILING_MS);
    logger.warn(`Redis reconectando em ${delay}ms (tentativa ${times})`);
    return delay;
}

/** BullMQ exige conexões separadas para Queue e Worker (Worker usa BLPOP bloqueante) */
function createRedisConnection() {
    if (config.redisUrl) {
        return new IORedis(config.redisUrl, {
            maxRetriesPerRequest: null,
            tls: config.redisUrl.startsWith("rediss://") ? {} : undefined,
            retryStrategy,
        });
    }

    return new IORedis({
        host: config.redisHost,
        port: config.redisPort,
        password: config.redisPassword || undefined,
        maxRetriesPerRequest: null,
        retryStrategy,
    });
}

// Conexão principal usada no servidor para monitorar o Redis
const connection = createRedisConnection();
connection.on("connect", () => logger.info("Redis conectado"));
connection.on("error", (err) => logger.error({ err: err.message }, "Erro Redis"));

module.exports = { connection, createRedisConnection };