const { whatsappQueue } = require("../queue/whatsappQueue");
const { sql } = require("../db/pg");

const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");

const {
    getStatus,
    getQr,
    sendText,
    sendImage,
    sendDocument,
    sendAudio,
    sendVideo,
    sendLocation,
    getReceivedMessages,
} = require("../whatsapp/client");

const crypto = require("crypto");

/* ─── AUTH MIDDLEWARE ─── */
function auth(req, res, next) {
    const key = req.headers["x-api-key"] || req.query.api_key || "";
    const expected = process.env.API_KEY || "";

    if (!key || !expected || key.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
        logger.warn({ ip: req.ip, path: req.path }, "Tentativa de acesso não autorizado");
        return res.status(401).json({ error: "unauthorized" });
    }
    next();
}

router.get("/status", auth, (req, res) => {
    res.json(getStatus());
});

router.get("/qr", auth, (req, res) => {
    const qr = getQr();
    if (!qr) {
        return res.status(404).json({ error: "qr_not_available", message: "Sem QR no momento (talvez já esteja conectado)." });
    }
    res.json({ qr }); 
});

router.post("/send", auth, async (req, res) => {
    try {
        const { to, text, source, request_id } = req.body;
        if (!to || !text) return res.status(400).json({ error: "to_and_text_required" });

        const onlyDigits = to.replace(/\D/g, "");
        if (onlyDigits.length < 10 || onlyDigits.length > 15) {
            return res.status(400).json({ error: "invalid_phone_number" });
        }

        const jid = `${onlyDigits}@s.whatsapp.net`;

        const [{ id: logId }] = await sql`
            insert into whatsapp_message_log
            (source, request_id, to_number, jid, message_text, status, queued_at)
            values (${source || null}, ${request_id || null}, ${onlyDigits}, ${jid}, ${text}, 'queued', now())
            returning id
        `;

        const job = await whatsappQueue.add("send-text", {
            logId,
            to: onlyDigits,
            jid,
            text
        });

        await sql`
            update whatsapp_message_log set queue_job_id = ${String(job.id)} where id = ${logId}
        `;

        res.json({ ok: true, queued: true, logId, jobId: job.id });
    } catch (err) {
        res.status(500).json({ error: "queue_failed", message: err.message });
    }
});

router.get("/logs", auth, async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        const lim = Math.min(Number(limit) || 50, 200);

        const filter = status ? sql`where status = ${status}` : sql``;

        const result = await sql`
            select id, created_at, to_number, message_text, status, attempts, last_error
            from whatsapp_message_log
            ${filter}
            order by id desc
            limit ${lim}
        `;

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "query_failed", message: err.message });
    }
});

router.get("/messages", auth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const messages = getReceivedMessages(limit);
    res.json({ count: messages.length, messages });
});

function validatePhone(to) {
    const digits = to.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
}

router.post("/send/image", auth, async (req, res) => {
    try {
        const { to, url, caption } = req.body;
        if (!to || !url) return res.status(400).json({ error: "to_and_url_required" });
        const digits = validatePhone(to);
        if (!digits) return res.status(400).json({ error: "invalid_phone_number" });

        const result = await sendImage(digits, url, caption);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "send_failed", message: err.message });
    }
});

router.post("/send/document", auth, async (req, res) => {
    try {
        const { to, url, filename, caption } = req.body;
        if (!to || !url) return res.status(400).json({ error: "to_and_url_required" });
        const digits = validatePhone(to);
        if (!digits) return res.status(400).json({ error: "invalid_phone_number" });

        const result = await sendDocument(digits, url, filename, caption);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "send_failed", message: err.message });
    }
});

router.post("/send/audio", auth, async (req, res) => {
    try {
        const { to, url, ptt } = req.body;
        if (!to || !url) return res.status(400).json({ error: "to_and_url_required" });
        const digits = validatePhone(to);
        if (!digits) return res.status(400).json({ error: "invalid_phone_number" });

        const result = await sendAudio(digits, url, !!ptt);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "send_failed", message: err.message });
    }
});

router.post("/send/video", auth, async (req, res) => {
    try {
        const { to, url, caption } = req.body;
        if (!to || !url) return res.status(400).json({ error: "to_and_url_required" });
        const digits = validatePhone(to);
        if (!digits) return res.status(400).json({ error: "invalid_phone_number" });

        const result = await sendVideo(digits, url, caption);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "send_failed", message: err.message });
    }
});

router.post("/send/location", auth, async (req, res) => {
    try {
        const { to, latitude, longitude, name } = req.body;
        if (!to || latitude == null || longitude == null) {
            return res.status(400).json({ error: "to_latitude_longitude_required" });
        }
        const digits = validatePhone(to);
        if (!digits) return res.status(400).json({ error: "invalid_phone_number" });

        const result = await sendLocation(digits, latitude, longitude, name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "send_failed", message: err.message });
    }
});

const path = require("path");
router.get("/dashboard", auth, (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

router.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
});

router.get("/health", (req, res) => {
    const status = getStatus();
    res.status(status.ready ? 200 : 503).json({
        service: "whatsapp-gateway",
        uptime: process.uptime(),
        ...status,
    });
});

module.exports = router;