"use strict";

const logger = require("../utils/logger");
const { ValidationError, NotFoundError, AppError } = require("../utils/errors");
const {
    validatePhone,
    validateMediaUrl,
    validateMediaUrlDns,
    validateText,
    sanitizeOptionalString,
} = require("../utils/validators");
const { queueTextMessage } = require("../services/messageService");
const {
    getStatus,
    getQr,
    sendImage,
    sendDocument,
    sendAudio,
    sendVideo,
    sendLocation,
    getReceivedMessages,
    disconnect,
} = require("../whatsapp/client");

// ─── Connection ───────────────────────────────────────────────────────────────

function handleGetStatus(_req, res) {
    res.json(getStatus());
}

function handleGetQr(_req, res) {
    const qr = getQr();
    if (!qr) {
        throw new NotFoundError("Sem QR no momento (talvez já esteja conectado).");
    }
    res.json({ qr });
}

async function handlePostDisconnect(_req, res) {
    try {
        await disconnect();
        res.json({ ok: true, message: "WhatsApp desconectado com sucesso" });
    } catch (err) {
        logger.error({ err }, "Erro ao desconectar WhatsApp");
        throw new AppError("Falha ao desconectar", 500, "disconnect_failed");
    }
}

// ─── Mensagens de texto ───────────────────────────────────────────────────────

async function handlePostSendText(req, res) {
    const { to, text, source, request_id } = req.body;

    if (!to || !text) {
        throw new ValidationError("Campos 'to' e 'text' são obrigatórios", { required: ["to", "text"] });
    }

    const textCheck = validateText(text);
    if (!textCheck.valid) {
        throw new ValidationError(textCheck.error);
    }

    const digits = validatePhone(to);
    if (!digits) {
        throw new ValidationError("Número de telefone inválido");
    }

    try {
        const safeSrc = sanitizeOptionalString(source, 100);
        const safeReqId = sanitizeOptionalString(request_id);
        const { logId, jobId } = await queueTextMessage({
            to: digits,
            text,
            source: safeSrc,
            requestId: safeReqId,
        });
        res.json({ ok: true, queued: true, logId, jobId });
    } catch (err) {
        logger.error({ err, path: req.path, requestId: req.id }, "Erro ao enfileirar mensagem");
        throw new AppError("Falha ao enfileirar mensagem", 500, "queue_failed");
    }
}

// ─── Mídia ────────────────────────────────────────────────────────────────────

async function handlePostSendImage(req, res) {
    const { caption } = req.body;
    await sendMedia(req, res, sendImage, (digits, url) => [digits, url, caption], "imagem");
}

async function handlePostSendDocument(req, res) {
    const { filename, caption } = req.body;
    await sendMedia(req, res, sendDocument, (digits, url) => [digits, url, filename, caption], "documento");
}

async function handlePostSendAudio(req, res) {
    const { ptt } = req.body;
    await sendMedia(req, res, sendAudio, (digits, url) => [digits, url, !!ptt], "áudio");
}

async function handlePostSendVideo(req, res) {
    const { caption } = req.body;
    await sendMedia(req, res, sendVideo, (digits, url) => [digits, url, caption], "vídeo");
}

async function handlePostSendLocation(req, res) {
    const { to, latitude, longitude, name } = req.body;

    if (!to || latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
        throw new ValidationError("Campos 'to', 'latitude' e 'longitude' são obrigatórios");
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ValidationError("Coordenadas inválidas", { latitude: "[-90,90]", longitude: "[-180,180]" });
    }

    const digits = validatePhone(to);
    if (!digits) {
        throw new ValidationError("Número de telefone inválido");
    }

    try {
        const result = await sendLocation(digits, lat, lng, name);
        res.json(result);
    } catch (err) {
        logger.error({ err, path: req.path, requestId: req.id }, "Erro ao enviar localização");
        throw new AppError("Falha ao enviar localização", 500, "send_failed");
    }
}

// ─── Mensagens recebidas ──────────────────────────────────────────────────────

function handleGetMessages(req, res) {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const messages = getReceivedMessages(limit).map(({ raw: _raw, ...safe }) => safe);
    res.json({ count: messages.length, messages });
}

// ─── Health ───────────────────────────────────────────────────────────────────

function handleHealthz(_req, res) {
    res.status(200).json({ ok: true });
}

function handleHealth(_req, res) {
    const status = getStatus();
    res.status(status.ready ? 200 : 503).json({
        service: "whatsapp-gateway",
        uptime: process.uptime(),
        ...status,
    });
}

// ─── Privado: envio genérico de mídia ─────────────────────────────────────────

async function sendMedia(req, res, sendFn, buildArgs, label) {
    const { to, url } = req.body;

    if (!to || !url) {
        throw new ValidationError("Campos 'to' e 'url' são obrigatórios");
    }

    const digits = validatePhone(to);
    if (!digits) {
        throw new ValidationError("Número de telefone inválido");
    }

    const urlCheck = validateMediaUrl(url);
    if (!urlCheck.valid) {
        throw new ValidationError(urlCheck.error);
    }

    // Validação async de DNS rebinding
    const dnsCheck = await validateMediaUrlDns(url);
    if (!dnsCheck.valid) {
        throw new ValidationError(dnsCheck.error);
    }

    try {
        const result = await sendFn(...buildArgs(digits, url));
        res.json(result);
    } catch (err) {
        logger.error({ err, path: req.path, requestId: req.id }, `Erro ao enviar ${label}`);
        throw new AppError(`Falha ao enviar ${label}`, 500, "send_failed");
    }
}

module.exports = {
    getStatus: handleGetStatus,
    getQr: handleGetQr,
    postDisconnect: handlePostDisconnect,
    postSendText: handlePostSendText,
    postSendImage: handlePostSendImage,
    postSendDocument: handlePostSendDocument,
    postSendAudio: handlePostSendAudio,
    postSendVideo: handlePostSendVideo,
    postSendLocation: handlePostSendLocation,
    getMessages: handleGetMessages,
    getHealthz: handleHealthz,
    getHealth: handleHealth,
};
