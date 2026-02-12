/**
 * Webhook dispatcher — dispara eventos para o CRM via HTTP POST
 *
 * Eventos:
 *  - message        → mensagem recebida
 *  - message.sent   → mensagem enviada com sucesso
 *  - message.failed → mensagem falhou após todas tentativas
 *  - status         → conexão mudou (connected / disconnected / qr)
 *  - message.update → status de entrega (delivered, read, played)
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL || null;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || null;
const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS) || 5000;

async function dispatchWebhook(event, data) {
    if (!WEBHOOK_URL) return; // webhook não configurado, ignora silenciosamente

    const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

        const headers = { "Content-Type": "application/json" };
        if (WEBHOOK_TOKEN) {
            headers["X-Webhook-Token"] = WEBHOOK_TOKEN;
        }

        const resp = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!resp.ok) {
            console.log(`⚠️ Webhook ${event} respondeu ${resp.status}`);
        }
    } catch (err) {
        // nunca deixa erro de webhook derrubar o gateway
        console.log(`⚠️ Webhook ${event} falhou: ${err.message}`);
    }
}

module.exports = { dispatchWebhook };
