const { Worker } = require("bullmq");
const { connection } = require("./redis");
const { sendText } = require("../whatsapp/client");
const { sql } = require("../db/pg");
const { dispatchWebhook } = require("../utils/webhook");
const logger = require("../utils/logger");

const worker = new Worker(
    "whatsapp-send",
    async (job) => {
        const { logId, to, text, jid } = job.data;
        const attemptNum = job.attemptsMade + 1;
        const maxAttempts = job.opts.attempts || 5;

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

            await sql`
                update whatsapp_message_log
                set status = ${newStatus},
                    attempts = ${attemptNum},
                    failed_at = case when ${newStatus} = 'failed' then now() else failed_at end,
                    last_error = ${msg}
                where id = ${logId}
            `;

            throw err; 
        }
    },
    {
        connection,
        limiter: {
            max: Number(process.env.RATE_LIMIT_MAX || 1),
            duration: Number(process.env.RATE_LIMIT_DURATION_MS || 1000),
        },
    }
);

worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed");
    dispatchWebhook("message.sent", {
        logId: job.data.logId,
        to: job.data.to,
        text: job.data.text,
        jobId: job.id,
    });
});

worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err?.message }, "Job failed");
    if (job && job.attemptsMade >= (job.opts.attempts || 5)) {
        dispatchWebhook("message.failed", {
            logId: job.data.logId,
            to: job.data.to,
            text: job.data.text,
            error: err?.message,
            jobId: job.id,
        });
    }
});

module.exports = { worker };