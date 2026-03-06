"use strict";

const crypto = require("crypto");
const config = require("../config");
const logger = require("./logger");

/**
 * Gera assinatura HMAC-SHA256 do body.
 * Permite que o receptor valide a autenticidade do webhook.
 *
 * @param {string} body   - JSON serializado do payload
 * @param {string} secret - Chave secreta compartilhada
 * @returns {string} Assinatura hex
 */
function signPayload(body, secret) {
    return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Dispara webhook POST para o CRM configurado.
 * Inclui X-Webhook-Token (legado) e X-Webhook-Signature (HMAC-SHA256).
 *
 * @param {string} event - Nome do evento (ex: "message", "status")
 * @param {object} data  - Dados do evento
 */
async function dispatchWebhook(event, data) {
    if (!config.webhookUrl) return;

    const webhookUrl = config.webhookUrl;
    const webhookToken = config.webhookToken || null;
    const timeoutMs = config.webhookTimeoutMs;

    const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
    };

    const body = JSON.stringify(payload);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const headers = { "Content-Type": "application/json" };

        // Token legado (backward-compat)
        if (webhookToken) {
            headers["X-Webhook-Token"] = webhookToken;
        }

        // Assinatura HMAC-SHA256 — permite ao receptor validar integridade
        if (webhookToken) {
            headers["X-Webhook-Signature"] = `sha256=${signPayload(body, webhookToken)}`;
        }

        const resp = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body,
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!resp.ok) {
            logger.warn({ event, status: resp.status }, "Webhook respondeu com erro");
        }
    } catch (err) {
        logger.error({ event, err: err.message }, "Falha ao disparar webhook");
    }
}

module.exports = { dispatchWebhook, signPayload };
