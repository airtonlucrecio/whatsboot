"use strict";

const { Worker } = require("bullmq");
const { createRedisConnection } = require("./redis");
const { sendText } = require("../whatsapp/client");
const { sql } = require("../db/pg");
const { dispatchWebhook } = require("../utils/webhook");
const logger = require("../utils/logger");
const config = require("../config");

/**
 * Cria e retorna o worker BullMQ.
 * Isola a criação para evitar side-effects no import e facilitar testes.
 *
 * @returns {{ worker: Worker, closeWorker: () => Promise<void> }}
 */
function createWorker() {
    const worker = new Worker(
        "whatsapp-send",
        async (job) => {
            const { logId, to, text } = job.data;
            const attemptNum = job.attemptsMade + 1;
            const maxAttempts = job.opts.attempts || config.queueAttempts;

            try {
                await sendText(to, text);

                await sql`
                    update whatsapp_message_log
                    set status = 'sent',
                        attempts = ${attemptNum},
                        sent_at = now(),
                        last_error = null
                    where id = ${logId}
                `;

                return { ok: true };
            } catch (err) {
                const msg = err?.message || String(err);
                const isFinal = attemptNum >= maxAttempts;
                const newStatus = isFinal ? "failed" : "retrying";

                try {
                    await sql`
                        update whatsapp_message_log
                        set status = ${newStatus},
                            attempts = ${attemptNum},
                            failed_at = case when ${newStatus} = 'failed' then now() else failed_at end,
                            last_error = ${msg}
                        where id = ${logId}
                    `;
                } catch (dbErr) {
                    logger.error({ logId, dbErr: dbErr.message }, "Falha ao atualizar status de erro no DB");
                }

                throw err;
            }
        },
        {
            connection: createRedisConnection(),
            limiter: {
                max: config.rateLimitMax,
                duration: config.rateLimitDurationMs,
            },
        }
    );

    worker.on("completed", (job) => {
        logger.info({ jobId: job.id, logId: job.data.logId }, "Job completed");
        dispatchWebhook("message.sent", {
            logId: job.data.logId,
            to: job.data.to,
            text: job.data.text,
            jobId: job.id,
        });
    });

    worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, logId: job?.data?.logId, error: err?.message }, "Job failed");
        if (job && job.attemptsMade >= (job.opts.attempts || config.queueAttempts)) {
            dispatchWebhook("message.failed", {
                logId: job.data.logId,
                to: job.data.to,
                text: job.data.text,
                error: err?.message,
                jobId: job.id,
            });
        }
    });

    worker.on("error", (err) => {
        logger.error({ error: err.message }, "Worker Redis error");
    });

    logger.info("Worker BullMQ iniciado");

    async function closeWorker() {
        logger.info("Encerrando worker...");
        await worker.close();
        logger.info("Worker encerrado com sucesso");
    }

    return { worker, closeWorker };
}

module.exports = { createWorker };