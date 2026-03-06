/**
 * messageService.js
 *
 * Camada de serviço que isola regras de negócio relativas a mensagens do WhatsApp.
 * As rotas chamam estas funções; a camada não sabe nada sobre req/res.
 */

"use strict";

const { sql } = require("../db/pg");
const { whatsappQueue } = require("../queue/whatsappQueue");
const logger = require("../utils/logger");
const { ValidationError } = require("../utils/errors");

const ALLOWED_STATUSES = new Set(["queued", "sent", "failed", "retrying"]);

// ─── Enfileirar mensagem de texto ────────────────────────────────────────────

/**
 * Cria registro no banco e adiciona o job na fila BullMQ.
 *
 * @param {{ to: string, text: string, source?: string, requestId?: string }} params
 * @returns {{ logId: number, jobId: string }}
 */
async function queueTextMessage({ to, text, source = null, requestId = null }) {
    const jid = `${to}@s.whatsapp.net`;

    const [{ id: logId }] = await sql`
        insert into whatsapp_message_log
            (source, request_id, to_number, jid, message_text, status, queued_at)
        values
            (${source}, ${requestId}, ${to}, ${jid}, ${text}, 'queued', now())
        returning id
    `;

    const job = await whatsappQueue.add("send-text", { logId, to, jid, text });
    const jobId = String(job.id);

    await sql`
        update whatsapp_message_log
        set queue_job_id = ${jobId}
        where id = ${logId}
    `;

    logger.info({ logId, jobId, to }, "Mensagem enfileirada");
    return { logId, jobId };
}

// ─── Buscar logs com cursor-based pagination ─────────────────────────────────

/**
 * Retorna logs com paginação por cursor (baseada no `id` DESC).
 *
 * @param {{ status?: string, limit?: number, cursor?: number }} params
 * @returns {{ rows: object[], nextCursor: number|null, hasMore: boolean }}
 */
async function getLogs({ status, limit = 50, cursor = null } = {}) {
    const lim = Math.min(Number(limit) || 50, 200);

    if (status && !ALLOWED_STATUSES.has(status)) {
        throw new ValidationError("Status inválido", { allowed: [...ALLOWED_STATUSES] });
    }

    const cursorNum = cursor ? Number(cursor) : null;

    // Constrói WHERE dinâmico com fragmentos parametrizados (sem sql.unsafe).
    const conditions = [];
    if (status) conditions.push(sql`status = ${status}`);
    if (cursorNum) conditions.push(sql`id < ${cursorNum}`);

    const where = conditions.length > 0
        ? sql`where ${conditions.reduce((a, b) => sql`${a} and ${b}`)}`
        : sql``;

    const rows = await sql`
        select id, created_at, to_number, message_text, status, attempts, last_error, queue_job_id
        from whatsapp_message_log
        ${where}
        order by id desc
        limit ${lim + 1}
    `;

    const hasMore = rows.length > lim;
    const trimmed = hasMore ? rows.slice(0, lim) : rows;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;

    return { rows: trimmed, nextCursor, hasMore };
}

// ─── Estatísticas agregadas ──────────────────────────────────────────────────

async function getStats() {
    const rows = await sql`
        select
            status,
            count(*)::int as count
        from whatsapp_message_log
        group by status
        order by status
    `;

    const base = [...ALLOWED_STATUSES].reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    for (const row of rows) base[row.status] = row.count;

    return Object.entries(base).map(([status, count]) => ({ status, count }));
}

// ─── Registro por ID ─────────────────────────────────────────────────────────
async function getLogById(id) {
    const rows = await sql`
        select id, created_at, to_number, jid, message_text, status, attempts, last_error, queue_job_id, source, request_id, queued_at, sent_at
        from whatsapp_message_log
        where id = ${Number(id)}
        limit 1
    `;
    return rows[0] ?? null;
}

module.exports = { queueTextMessage, getLogs, getStats, getLogById, ALLOWED_STATUSES };
