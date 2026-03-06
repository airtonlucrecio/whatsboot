"use strict";

const crypto = require("crypto");

/** Tamanho máximo aceito para Request ID externo */
const MAX_REQUEST_ID_LENGTH = 128;

/** Aceita apenas UUID, alfanumérico e hífens — bloqueia injection nos logs */
const VALID_REQUEST_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Middleware que gera um Request ID único por requisição.
 * Reutiliza o header X-Request-Id se já vier do client/proxy (validado e truncado),
 * senão gera um UUID v4.
 * O ID é anexado a `req.id` e devolvido no header de resposta.
 */
function requestId(req, res, next) {
    const external = req.headers["x-request-id"];
    const id = (external && isValidRequestId(external))
        ? external.slice(0, MAX_REQUEST_ID_LENGTH)
        : crypto.randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
}

/**
 * Valida formato do Request ID externo.
 * @param {string} value
 * @returns {boolean}
 */
function isValidRequestId(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= MAX_REQUEST_ID_LENGTH
        && VALID_REQUEST_ID_RE.test(value);
}

module.exports = { requestId, isValidRequestId, MAX_REQUEST_ID_LENGTH };
