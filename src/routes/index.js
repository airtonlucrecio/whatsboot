"use strict";

const express = require("express");
const router = express.Router();

const { auth } = require("../middleware/auth");
const whatsapp = require("../controllers/WhatsAppController");
const log = require("../controllers/LogController");

// ─── Definição centralizada de rotas (DRY) ───────────────────────────────────
// Express 5 captura rejeições de Promise automaticamente — asyncHandler removido.

/** @type {Array<[string, string, ...Function[]]>} [method, path, ...handlers] */
const API_ROUTES = [
    // WhatsApp: conexão
    ["get",  "/status",         auth, whatsapp.getStatus],
    ["get",  "/qr",             auth, whatsapp.getQr],
    ["post", "/disconnect",     auth, whatsapp.postDisconnect],

    // WhatsApp: envio
    ["post", "/send",           auth, whatsapp.postSendText],
    ["post", "/send/image",     auth, whatsapp.postSendImage],
    ["post", "/send/document",  auth, whatsapp.postSendDocument],
    ["post", "/send/audio",     auth, whatsapp.postSendAudio],
    ["post", "/send/video",     auth, whatsapp.postSendVideo],
    ["post", "/send/location",  auth, whatsapp.postSendLocation],

    // WhatsApp: mensagens recebidas
    ["get",  "/messages",       auth, whatsapp.getMessages],

    // Logs & métricas
    ["get",  "/logs",           auth, log.list],
    ["get",  "/logs/:id",       auth, log.getById],
    ["get",  "/stats",          auth, log.stats],
];

/**
 * Registra todas as rotas em um router.
 * @param {express.Router} target
 */
function registerRoutes(target) {
    for (const [method, path, ...handlers] of API_ROUTES) {
        target[method](path, ...handlers);
    }
}

// ─── API v1 ──────────────────────────────────────────────────────────────────
const v1 = express.Router();
registerRoutes(v1);
router.use("/v1", v1);

// ─── Rotas legacy (sem /v1) para backward-compat — podem ser removidas no futuro
registerRoutes(router);

// ─── Health (sem auth, sem versionamento) ─────────────────────────────────────
router.get("/healthz", whatsapp.getHealthz);
router.get("/health", whatsapp.getHealth);

module.exports = router;
