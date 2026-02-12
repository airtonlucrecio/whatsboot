const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode");
const { dispatchWebhook } = require("../utils/webhook");
const logger = require("../utils/logger");

let sock = null;
let lastQrDataUrl = null;
let isReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

const MAX_MESSAGES = 500;
let receivedMessages = [];

function getReconnectDelay() {
    const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 60000);
    return delay;
}

async function whatsappInit() {
    if (sock) {
        try {
            sock.ev.removeAllListeners();
            sock.ws.close();
        } catch (_) { /* ignora */ }
        sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState("auth");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: "silent" }),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            lastQrDataUrl = await qrcode.toDataURL(qr);
            isReady = false;
            logger.info("QR Code gerado (leia no /qr)");
        }

        if (connection === "open") {
            isReady = true;
            lastQrDataUrl = null;
            reconnectAttempts = 0;
            logger.info("WhatsApp conectado!");
            dispatchWebhook("status", { status: "connected" });
        }

        if (connection === "close") {
            isReady = false;

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn("WhatsApp desconectou", { statusCode, shouldReconnect });
            dispatchWebhook("status", { status: "disconnected", statusCode, willReconnect: shouldReconnect });

            if (shouldReconnect) {
                reconnectAttempts++;

                if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
                    logger.error(`Falhou ${MAX_RECONNECT_ATTEMPTS} tentativas de reconexão. Aguardando restart do PM2.`);
                    dispatchWebhook("status", { status: "reconnect_exhausted", attempts: reconnectAttempts });
                    process.exit(1);
                }

                const delay = getReconnectDelay();
                logger.info(`Reconectando em ${delay / 1000}s (tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => whatsappInit(), delay);
            } else {
                logger.error("Sessão deslogada. Apague a pasta auth/ e conecte de novo.");
                dispatchWebhook("status", { status: "logged_out" });
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
        if (type !== "notify") return;

        for (const msg of msgs) {
            if (msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            const sender = msg.pushName || from;
            const timestamp = msg.messageTimestamp
                ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
                : new Date().toISOString();
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                null;

            const messageType = Object.keys(msg.message || {})[0] || "unknown";

            const parsed = {
                id: msg.key.id,
                from,
                sender,
                timestamp,
                type: messageType,
                text,
                raw: msg,
            };

            receivedMessages.unshift(parsed);
            if (receivedMessages.length > MAX_MESSAGES) {
                receivedMessages = receivedMessages.slice(0, MAX_MESSAGES);
            }

            logger.info(`Mensagem de ${sender} (${from}): ${text || `[${messageType}]`}`);

            dispatchWebhook("message", parsed);
        }
    });

    sock.ev.on("messages.update", (updates) => {
        for (const update of updates) {
            const statusMap = { 2: "delivered", 3: "read", 4: "played" };
            const statusName = statusMap[update.update?.status];

            if (statusName) {
                dispatchWebhook("message.update", {
                    id: update.key.id,
                    remoteJid: update.key.remoteJid,
                    fromMe: update.key.fromMe,
                    status: statusName,
                });
            }
        }
    });
}

function getStatus() {
    return {
        ready: isReady,
        hasQr: !!lastQrDataUrl
    };
}

function getQr() {
    return lastQrDataUrl;
}

function getReceivedMessages(limit = 50) {
    return receivedMessages.slice(0, limit);
}

async function sendText(to, text) {
    if (!sock) throw new Error("WhatsApp socket não iniciado");
    if (!isReady) throw new Error("WhatsApp não está conectado");

    const jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, { text });
    return { ok: true, messageId: result?.key?.id };
}

async function sendImage(to, url, caption) {
    if (!sock) throw new Error("WhatsApp socket não iniciado");
    if (!isReady) throw new Error("WhatsApp não está conectado");

    const jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, {
        image: { url },
        caption: caption || undefined,
    });
    return { ok: true, messageId: result?.key?.id };
}

async function sendDocument(to, url, filename, caption) {
    if (!sock) throw new Error("WhatsApp socket não iniciado");
    if (!isReady) throw new Error("WhatsApp não está conectado");

    const jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, {
        document: { url },
        fileName: filename || "arquivo",
        caption: caption || undefined,
    });
    return { ok: true, messageId: result?.key?.id };
}

async function sendAudio(to, url, ptt = false) {
    if (!sock) throw new Error("WhatsApp socket não iniciado");
    if (!isReady) throw new Error("WhatsApp não está conectado");

    const jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, {
        audio: { url },
        ptt,
    });
    return { ok: true, messageId: result?.key?.id };
}

async function sendVideo(to, url, caption) {
    if (!sock) throw new Error("WhatsApp socket não iniciado");
    if (!isReady) throw new Error("WhatsApp não está conectado");

    const jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, {
        video: { url },
        caption: caption || undefined,
    });
    return { ok: true, messageId: result?.key?.id };
}

async function sendLocation(to, latitude, longitude, name) {
    if (!sock) throw new Error("WhatsApp socket não iniciado");
    if (!isReady) throw new Error("WhatsApp não está conectado");

    const jid = `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, {
        location: {
            degreesLatitude: latitude,
            degreesLongitude: longitude,
            name: name || undefined,
        },
    });
    return { ok: true, messageId: result?.key?.id };
}

module.exports = {
    whatsappInit,
    getStatus,
    getQr,
    getReceivedMessages,
    sendText,
    sendImage,
    sendDocument,
    sendAudio,
    sendVideo,
    sendLocation,
};