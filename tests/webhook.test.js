"use strict";

jest.mock("../src/config", () => ({
    webhookUrl: "https://example.com/webhook",
    webhookToken: "my-secret-token",
    webhookTimeoutMs: 5000,
}));

jest.mock("../src/utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { dispatchWebhook, signPayload } = require("../src/utils/webhook");
const logger = require("../src/utils/logger");

// ─── signPayload ──────────────────────────────────────────────────────────────

describe("signPayload", () => {
    test("gera HMAC-SHA256 hex determinístico", () => {
        const body = '{"event":"test","data":{}}';
        const sig1 = signPayload(body, "secret");
        const sig2 = signPayload(body, "secret");
        expect(sig1).toBe(sig2);
        expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    test("chaves diferentes geram assinaturas diferentes", () => {
        const body = '{"event":"test"}';
        const sig1 = signPayload(body, "key-a");
        const sig2 = signPayload(body, "key-b");
        expect(sig1).not.toBe(sig2);
    });

    test("payloads diferentes geram assinaturas diferentes", () => {
        const sig1 = signPayload("payload-a", "key");
        const sig2 = signPayload("payload-b", "key");
        expect(sig1).not.toBe(sig2);
    });
});

// ─── dispatchWebhook ──────────────────────────────────────────────────────────

describe("dispatchWebhook", () => {
    let originalFetch;

    beforeEach(() => {
        jest.clearAllMocks();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test("envia POST com headers corretos (Token + Signature)", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true });

        await dispatchWebhook("message", { text: "hello" });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, options] = global.fetch.mock.calls[0];

        expect(url).toBe("https://example.com/webhook");
        expect(options.method).toBe("POST");
        expect(options.headers["Content-Type"]).toBe("application/json");
        expect(options.headers["X-Webhook-Token"]).toBe("my-secret-token");
        expect(options.headers["X-Webhook-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);

        // Verifica que a assinatura corresponde ao body enviado
        const body = options.body;
        const expectedSig = `sha256=${signPayload(body, "my-secret-token")}`;
        expect(options.headers["X-Webhook-Signature"]).toBe(expectedSig);
    });

    test("payload contém event, timestamp e data", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true });

        await dispatchWebhook("status", { status: "connected" });

        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.event).toBe("status");
        expect(body.data).toEqual({ status: "connected" });
        expect(body.timestamp).toBeDefined();
    });

    test("loga warn quando webhook responde com erro HTTP", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await dispatchWebhook("test", {});

        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ event: "test", status: 500 }),
            "Webhook respondeu com erro",
        );
    });

    test("loga error quando fetch falha (rede)", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

        await dispatchWebhook("test", {});

        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ event: "test", err: "ECONNREFUSED" }),
            "Falha ao disparar webhook",
        );
    });
});

// ─── dispatchWebhook com webhookUrl vazio ─────────────────────────────────────

describe("dispatchWebhook (webhook desabilitado)", () => {
    test("não dispara fetch quando webhookUrl é vazio", async () => {
        // Reimporta com webhookUrl vazio
        jest.resetModules();
        jest.mock("../src/config", () => ({
            webhookUrl: "",
            webhookToken: "",
            webhookTimeoutMs: 5000,
        }));
        jest.mock("../src/utils/logger", () => ({
            info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
        }));

        const { dispatchWebhook: dispatch } = require("../src/utils/webhook");
        global.fetch = jest.fn();

        await dispatch("test", {});

        expect(global.fetch).not.toHaveBeenCalled();
    });
});
