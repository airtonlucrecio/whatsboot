const EventEmitter = require("events");
const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode");
const { dispatchWebhook } = require("../utils/webhook");
const logger = require("../utils/logger");
const config = require("../config");
const { buildCandidates, toDirectJid } = require("../utils/phoneNormalizer");
const { RingBuffer } = require("../utils/RingBuffer");

class WhatsAppClient extends EventEmitter {

    #sock = null;
    #lastQrDataUrl = null;
    #isReady = false;
    #reconnectAttempts = 0;
    #receivedMessages;

    constructor() {
        super();
        this.#receivedMessages = new RingBuffer(config.maxStoredMessages);
    }

    // ─── Getters públicos ────────────────────────────────────────────────────
    get isReady() { return this.#isReady; }
    get hasQr() { return !!this.#lastQrDataUrl; }

    // ─── API Pública ─────────────────────────────────────────────────────────
    getStatus() { return { ready: this.#isReady, hasQr: this.hasQr }; }
    getQr() { return this.#lastQrDataUrl; }
    getReceivedMessages(limit = 50) { return this.#receivedMessages.toArray(limit); }

    async init() {
        this.#teardown();
        const { state, saveCreds } = await useMultiFileAuthState(config.authPath);
        const { version } = await fetchLatestBaileysVersion();

        this.#sock = makeWASocket({
            version,
            auth: state,
            logger: P({ level: "silent" }),
            markOnlineOnConnect: false,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
        });

        this.#sock.ev.on("creds.update", saveCreds);
        this.#sock.ev.on("connection.update", (u) => this.#onConnectionUpdate(u));
        this.#sock.ev.on("messages.upsert", ({ messages: msgs, type }) => this.#onMessagesUpsert(msgs, type));
        this.#sock.ev.on("messages.update", (updates) => this.#onMessagesUpdate(updates));
    }

    async sendText(to, text) {
        this.#ensureConnected();
        const jid = await this.#resolveJid(to);
        const result = await this.#sock.sendMessage(jid, { text });
        return { ok: true, messageId: result?.key?.id, jid };
    }

    async sendImage(to, url, caption) {
        this.#ensureConnected();
        const jid = await this.#resolveJid(to);
        const result = await this.#sock.sendMessage(jid, { image: { url }, caption: caption || undefined });
        return { ok: true, messageId: result?.key?.id, jid };
    }

    async sendDocument(to, url, filename, caption) {
        this.#ensureConnected();
        const jid = await this.#resolveJid(to);
        const result = await this.#sock.sendMessage(jid, {
            document: { url },
            fileName: filename || "arquivo",
            caption: caption || undefined,
        });
        return { ok: true, messageId: result?.key?.id, jid };
    }

    async sendAudio(to, url, ptt = false) {
        this.#ensureConnected();
        const jid = await this.#resolveJid(to);
        const result = await this.#sock.sendMessage(jid, { audio: { url }, ptt });
        return { ok: true, messageId: result?.key?.id, jid };
    }

    async sendVideo(to, url, caption) {
        this.#ensureConnected();
        const jid = await this.#resolveJid(to);
        const result = await this.#sock.sendMessage(jid, { video: { url }, caption: caption || undefined });
        return { ok: true, messageId: result?.key?.id, jid };
    }

    async sendLocation(to, latitude, longitude, name) {
        this.#ensureConnected();
        const jid = await this.#resolveJid(to);
        const result = await this.#sock.sendMessage(jid, {
            location: { degreesLatitude: latitude, degreesLongitude: longitude, name: name || undefined },
        });
        return { ok: true, messageId: result?.key?.id, jid };
    }

    async disconnect() {
        if (!this.#sock) throw new Error("WhatsApp não está conectado");
        try {
            this.#isReady = false;
            this.#lastQrDataUrl = null;
            this.#reconnectAttempts = 0;
            this.#sock.ev.removeAllListeners();
            try { await this.#sock.logout(); } catch { /* ignora erros do logout */ }
            try { this.#sock.ws.close(); } catch { /* ignora se já fechado */ }
            this.#sock = null;
            logger.info("WhatsApp desconectado pelo usuário — reiniciando para gerar novo QR...");
            dispatchWebhook("status", { status: "manual_disconnect" });
            // Reinicia automaticamente para gerar um novo QR Code
            setTimeout(() => this.init().catch(err => logger.error({ err }, "Erro ao reiniciar WhatsApp após disconnect")), 1500);
        } catch (err) {
            logger.error({ err: err.message }, "Erro ao desconectar WhatsApp");
            this.#sock = null;
            setTimeout(() => this.init().catch(e => logger.error({ err: e }, "Erro ao reiniciar WhatsApp após erro de disconnect")), 1500);
            throw err;
        }
    }

    // ─── Privados ────────────────────────────────────────────────────────────
    #teardown() {
        if (this.#sock) {
            try { this.#sock.ev.removeAllListeners(); this.#sock.ws.close(); } catch { /* noop */ }
            this.#sock = null;
        }
    }

    #ensureConnected() {
        if (!this.#sock) throw new Error("WhatsApp socket não iniciado");
        if (!this.#isReady) throw new Error("WhatsApp não está conectado");
    }

    #getReconnectDelay() {
        return Math.min(2000 * Math.pow(2, this.#reconnectAttempts), 60000);
    }

    async #resolveJid(to) {
        const candidates = buildCandidates(to);
        const digits = String(to).replace(/\D/g, "");

        for (const candidate of candidates) {
            try {
                const [result] = await this.#sock.onWhatsApp(candidate);
                if (result?.exists) { logger.debug(`JID resolvido: ${candidate} → ${result.jid}`); return result.jid; }
            } catch (err) {
                logger.debug({ err: err.message, candidate }, "onWhatsApp falhou para candidato");
            }
        }
        logger.warn(`onWhatsApp não encontrou ${digits}, usando JID direto`);
        return toDirectJid(digits);
    }

    async #onConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { this.#lastQrDataUrl = await qrcode.toDataURL(qr); this.#isReady = false; logger.info("QR Code gerado (leia no /qr)"); }
        if (connection === "open") {
            this.#isReady = true; this.#lastQrDataUrl = null; this.#reconnectAttempts = 0;
            logger.info("WhatsApp conectado!"); dispatchWebhook("status", { status: "connected" });
        }
        if (connection === "close") {
            this.#isReady = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            logger.warn("WhatsApp desconectou", { statusCode, shouldReconnect });
            dispatchWebhook("status", { status: "disconnected", statusCode, willReconnect: shouldReconnect });
            if (shouldReconnect) {
                this.#reconnectAttempts++;
                if (this.#reconnectAttempts > config.maxReconnectAttempts) {
                    logger.error(`Falhou ${config.maxReconnectAttempts} tentativas. Aguardando restart do PM2.`);
                    dispatchWebhook("status", { status: "reconnect_exhausted", attempts: this.#reconnectAttempts });
                    return;
                }
                const delay = this.#getReconnectDelay();
                logger.info(`Reconectando em ${delay / 1000}s (tentativa ${this.#reconnectAttempts}/${config.maxReconnectAttempts})...`);
                setTimeout(() => this.init(), delay);
            } else {
                // Sessão expirada/deslogada — reinicia para gerar novo QR
                logger.warn("Sessão deslogada. Reiniciando para gerar novo QR Code...");
                dispatchWebhook("status", { status: "logged_out" });
                this.#reconnectAttempts = 0;
                setTimeout(() => this.init().catch(err => logger.error({ err }, "Erro ao reiniciar após logout")), 2000);
            }
        }
    }

    #onMessagesUpsert(msgs, type) {
        if (type !== "notify") return;
        for (const msg of msgs) {
            if (msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            const sender = msg.pushName || from;
            const timestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString();
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || null;
            const messageType = Object.keys(msg.message || {})[0] || "unknown";
            const parsed = { id: msg.key.id, from, sender, timestamp, type: messageType, text };
            this.#receivedMessages.push(parsed);
            logger.info(`Mensagem de ${sender} (${from}): ${text || `[${messageType}]`}`);
            dispatchWebhook("message", parsed);
        }
    }

    #onMessagesUpdate(updates) {
        const statusMap = { 2: "delivered", 3: "read", 4: "played" };
        for (const update of updates) {
            const statusName = statusMap[update.update?.status];
            if (statusName) dispatchWebhook("message.update", { id: update.key.id, remoteJid: update.key.remoteJid, fromMe: update.key.fromMe, status: statusName });
        }
    }
}

const whatsappClient = new WhatsAppClient();

/* ─── Named exports com backward-compat ─────────────────────────────────── */
module.exports = {
    WhatsAppClient,
    whatsappClient,
    whatsappInit: () => whatsappClient.init(),
    getStatus: () => whatsappClient.getStatus(),
    getQr: () => whatsappClient.getQr(),
    getReceivedMessages: (limit) => whatsappClient.getReceivedMessages(limit),
    sendText: (to, text) => whatsappClient.sendText(to, text),
    sendImage: (to, url, caption) => whatsappClient.sendImage(to, url, caption),
    sendDocument: (to, url, fn, caption) => whatsappClient.sendDocument(to, url, fn, caption),
    sendAudio: (to, url, ptt) => whatsappClient.sendAudio(to, url, ptt),
    sendVideo: (to, url, caption) => whatsappClient.sendVideo(to, url, caption),
    sendLocation: (to, lat, lng, name) => whatsappClient.sendLocation(to, lat, lng, name),
    disconnect: () => whatsappClient.disconnect(),
};
