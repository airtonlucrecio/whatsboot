"use strict";

/**
 * Configuração centralizada da aplicação.
 * Valida variáveis obrigatórias no boot e exporta valores tipados com defaults seguros.
 */

require("dotenv").config();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
    }
    return value;
}

function optionalEnv(name, fallback) {
    return process.env[name] || fallback;
}

function optionalInt(name, fallback) {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

// eslint-disable-next-line no-unused-vars -- reservado para uso futuro
function optionalBool(name, fallback) {
    const raw = process.env[name];
    if (!raw) return fallback;
    return raw === "true" || raw === "1";
}

// ─── Validação e exportação ──────────────────────────────────────────────────

const NODE_ENV = optionalEnv("NODE_ENV", "development");
const isProduction = NODE_ENV === "production";

const config = Object.freeze({
    // ─── App ──────────────────────────────────────────────────────────────
    nodeEnv: NODE_ENV,
    isProduction,
    port: optionalInt("PORT", 3333),
    logLevel: optionalEnv("LOG_LEVEL", isProduction ? "info" : "debug"),

    // ─── Security ─────────────────────────────────────────────────────────
    apiKey: requireEnv("API_KEY"),
    corsOrigin: requireEnv("CORS_ORIGIN"),

    // ─── Database ─────────────────────────────────────────────────────────
    databaseUrl: requireEnv("DATABASE_URL"),
    dbPoolMax: optionalInt("DB_POOL_MAX", 10),
    dbSsl: optionalEnv("DB_SSL", isProduction ? "require" : ""),

    // ─── Redis ────────────────────────────────────────────────────────────
    redisUrl: optionalEnv("REDIS_URL", ""),
    redisHost: optionalEnv("REDIS_HOST", "localhost"),
    redisPort: optionalInt("REDIS_PORT", 6379),
    redisPassword: optionalEnv("REDIS_PASSWORD", ""),

    // ─── WhatsApp ─────────────────────────────────────────────────────────
    authPath: optionalEnv("AUTH_PATH", "auth"),

    // ─── Queue & Rate Limit ───────────────────────────────────────────────
    rateLimitMax: optionalInt("RATE_LIMIT_MAX", 1),
    rateLimitDurationMs: optionalInt("RATE_LIMIT_DURATION_MS", 1000),
    queueAttempts: optionalInt("QUEUE_ATTEMPTS", 5),
    queueBackoffDelay: optionalInt("QUEUE_BACKOFF_DELAY", 2000),
    queueRetentionCount: optionalInt("QUEUE_RETENTION_COUNT", 500),

    // ─── API Rate Limit ───────────────────────────────────────────────────
    apiRateLimitWindowMs: optionalInt("API_RATE_LIMIT_WINDOW_MS", 60_000),
    apiRateLimitMax: optionalInt("API_RATE_LIMIT_MAX", 60),

    // ─── Webhook ──────────────────────────────────────────────────────────
    webhookUrl: optionalEnv("WEBHOOK_URL", ""),
    webhookToken: optionalEnv("WEBHOOK_TOKEN", ""),
    webhookTimeoutMs: optionalInt("WEBHOOK_TIMEOUT_MS", 5000),

    // ─── WhatsApp Client ──────────────────────────────────────────────────
    maxReconnectAttempts: optionalInt("MAX_RECONNECT_ATTEMPTS", 10),
    maxStoredMessages: optionalInt("MAX_STORED_MESSAGES", 500),
});

module.exports = config;
