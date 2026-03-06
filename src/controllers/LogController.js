"use strict";

const logger = require("../utils/logger");
const { ValidationError, NotFoundError, AppError } = require("../utils/errors");
const { getLogs, getStats, getLogById } = require("../services/messageService");

// ─── Listagem com cursor-based pagination ─────────────────────────────────────

async function list(req, res) {
    const { status, limit, cursor } = req.query;

    try {
        const { rows, nextCursor, hasMore } = await getLogs({
            status,
            limit: limit ? Number(limit) : 50,
            cursor: cursor ? Number(cursor) : null,
        });
        res.json({ rows, nextCursor, hasMore });
    } catch (err) {
        if (err instanceof ValidationError || err.message === "invalid_status") {
            throw new ValidationError("Status inválido", { allowed: err.allowed || err.details });
        }
        logger.error({ err, path: req.path, requestId: req.id }, "Erro ao buscar logs");
        throw new AppError("Falha ao buscar logs", 500, "query_failed");
    }
}

// ─── Detalhe por ID ───────────────────────────────────────────────────────────

async function getById(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationError("ID inválido");
    }

    try {
        const row = await getLogById(id);
        if (!row) throw new NotFoundError("Log não encontrado");
        res.json(row);
    } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError) throw err;
        logger.error({ err, path: req.path, requestId: req.id }, "Erro ao buscar log por id");
        throw new AppError("Falha ao buscar log", 500, "query_failed");
    }
}

// ─── Estatísticas agregadas ───────────────────────────────────────────────────

async function stats(_req, res) {
    try {
        const data = await getStats();
        res.json(data);
    } catch (err) {
        logger.error({ err }, "Erro ao buscar stats");
        throw new AppError("Falha ao buscar estatísticas", 500, "query_failed");
    }
}

module.exports = { list, getById, stats };
