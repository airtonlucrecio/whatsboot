"use strict";

const crypto = require("crypto");
const config = require("../config");
const logger = require("../utils/logger");
const { UnauthorizedError } = require("../utils/errors");

const MAX_KEY_LENGTH = 256;

/**
 * Extrai a API key de:
 *  1. Header `x-api-key: <token>`
 *  2. Header `Authorization: Bearer <token>`
 */
function extractKey(req) {
    const direct = req.headers["x-api-key"];
    if (direct) return direct;

    const authHeader = req.headers["authorization"] || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : "";
}

function auth(req, _res, next) {
    const key = extractKey(req).slice(0, MAX_KEY_LENGTH);
    const expected = config.apiKey.slice(0, MAX_KEY_LENGTH);

    if (!key) {
        logger.warn({ ip: req.ip, path: req.path, requestId: req.id }, "Acesso negado: API_KEY ausente");
        return next(new UnauthorizedError());
    }

    if (key.length !== expected.length) {
        logger.warn({ ip: req.ip, path: req.path, requestId: req.id }, "Tentativa de acesso não autorizado");
        return next(new UnauthorizedError());
    }

    const isValid = crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
    if (!isValid) {
        logger.warn({ ip: req.ip, path: req.path, requestId: req.id }, "Tentativa de acesso não autorizado");
        return next(new UnauthorizedError());
    }

    return next();
}

module.exports = { auth };
