"use strict";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../src/config", () => ({
    apiKey: "test-key",
    corsOrigin: "http://localhost",
    webhookUrl: "",
    webhookToken: "",
    webhookTimeoutMs: 5000,
}));

jest.mock("../src/utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock("../src/services/messageService", () => ({
    queueTextMessage: jest.fn(),
}));

jest.mock("../src/whatsapp/client", () => ({
    getStatus: jest.fn(),
    getQr: jest.fn(),
    sendImage: jest.fn(),
    sendDocument: jest.fn(),
    sendAudio: jest.fn(),
    sendVideo: jest.fn(),
    sendLocation: jest.fn(),
    getReceivedMessages: jest.fn(),
    disconnect: jest.fn(),
}));

// Stub DNS lookup para evitar rede real nos testes
jest.mock("dns", () => ({
    promises: {
        lookup: jest.fn().mockResolvedValue({ address: "93.184.216.34", family: 4 }),
    },
}));

const controller = require("../src/controllers/WhatsAppController");
const { queueTextMessage } = require("../src/services/messageService");
const client = require("../src/whatsapp/client");
const { ValidationError, NotFoundError, AppError } = require("../src/utils/errors");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(body = {}, query = {}, params = {}) {
    return { body, query, params, path: "/test", id: "req-1" };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// ─── getStatus ────────────────────────────────────────────────────────────────

describe("WhatsAppController.getStatus", () => {
    test("retorna status do client", () => {
        client.getStatus.mockReturnValue({ ready: true, hasQr: false });
        const res = mockRes();

        controller.getStatus(mockReq(), res);

        expect(res.json).toHaveBeenCalledWith({ ready: true, hasQr: false });
    });
});

// ─── getQr ────────────────────────────────────────────────────────────────────

describe("WhatsAppController.getQr", () => {
    test("retorna QR quando disponível", () => {
        client.getQr.mockReturnValue("data:image/png;base64,ABC");
        const res = mockRes();

        controller.getQr(mockReq(), res);

        expect(res.json).toHaveBeenCalledWith({ qr: "data:image/png;base64,ABC" });
    });

    test("lança NotFoundError quando QR não disponível", () => {
        client.getQr.mockReturnValue(null);

        expect(() => controller.getQr(mockReq(), mockRes())).toThrow(NotFoundError);
    });
});

// ─── postSendText ─────────────────────────────────────────────────────────────

describe("WhatsAppController.postSendText", () => {
    beforeEach(() => jest.clearAllMocks());

    test("enfileira mensagem com dados válidos", async () => {
        queueTextMessage.mockResolvedValue({ logId: 1, jobId: "j-1" });
        const req = mockReq({ to: "5511991234567", text: "Olá", source: "api", request_id: "r-1" });
        const res = mockRes();

        await controller.postSendText(req, res);

        expect(queueTextMessage).toHaveBeenCalledWith(expect.objectContaining({
            to: "5511991234567",
            text: "Olá",
        }));
        expect(res.json).toHaveBeenCalledWith({ ok: true, queued: true, logId: 1, jobId: "j-1" });
    });

    test("lança ValidationError sem campo 'to'", async () => {
        const req = mockReq({ text: "Olá" });
        await expect(controller.postSendText(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError sem campo 'text'", async () => {
        const req = mockReq({ to: "5511991234567" });
        await expect(controller.postSendText(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para telefone inválido", async () => {
        const req = mockReq({ to: "123", text: "Olá" });
        await expect(controller.postSendText(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para texto muito longo", async () => {
        const req = mockReq({ to: "5511991234567", text: "a".repeat(4097) });
        await expect(controller.postSendText(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança AppError quando fila falha", async () => {
        queueTextMessage.mockRejectedValue(new Error("DB_DOWN"));
        const req = mockReq({ to: "5511991234567", text: "Olá" });
        await expect(controller.postSendText(req, mockRes())).rejects.toThrow(AppError);
    });
});

// ─── postSendImage ────────────────────────────────────────────────────────────

describe("WhatsAppController.postSendImage", () => {
    beforeEach(() => jest.clearAllMocks());

    test("envia imagem com dados válidos", async () => {
        client.sendImage.mockResolvedValue({ ok: true, messageId: "img-1" });
        const req = mockReq({ to: "5511991234567", url: "https://example.com/img.jpg", caption: "foto" });
        const res = mockRes();

        await controller.postSendImage(req, res);

        expect(client.sendImage).toHaveBeenCalledWith("5511991234567", "https://example.com/img.jpg", "foto");
        expect(res.json).toHaveBeenCalledWith({ ok: true, messageId: "img-1" });
    });

    test("lança ValidationError sem 'to' ou 'url'", async () => {
        const req = mockReq({ to: "5511991234567" });
        await expect(controller.postSendImage(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para URL interna (SSRF)", async () => {
        const req = mockReq({ to: "5511991234567", url: "http://localhost/secret" });
        await expect(controller.postSendImage(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para protocolo não permitido", async () => {
        const req = mockReq({ to: "5511991234567", url: "ftp://example.com/file" });
        await expect(controller.postSendImage(req, mockRes())).rejects.toThrow(ValidationError);
    });
});

// ─── postSendLocation ─────────────────────────────────────────────────────────

describe("WhatsAppController.postSendLocation", () => {
    beforeEach(() => jest.clearAllMocks());

    test("envia localização com dados válidos", async () => {
        client.sendLocation.mockResolvedValue({ ok: true });
        const req = mockReq({ to: "5511991234567", latitude: -23.5505, longitude: -46.6333, name: "SP" });
        const res = mockRes();

        await controller.postSendLocation(req, res);

        expect(client.sendLocation).toHaveBeenCalledWith("5511991234567", -23.5505, -46.6333, "SP");
    });

    test("lança ValidationError sem latitude/longitude", async () => {
        const req = mockReq({ to: "5511991234567" });
        await expect(controller.postSendLocation(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para latitude fora de range", async () => {
        const req = mockReq({ to: "5511991234567", latitude: 91, longitude: 0 });
        await expect(controller.postSendLocation(req, mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para longitude fora de range", async () => {
        const req = mockReq({ to: "5511991234567", latitude: 0, longitude: -181 });
        await expect(controller.postSendLocation(req, mockRes())).rejects.toThrow(ValidationError);
    });
});

// ─── postDisconnect ───────────────────────────────────────────────────────────

describe("WhatsAppController.postDisconnect", () => {
    test("retorna sucesso ao desconectar", async () => {
        client.disconnect.mockResolvedValue(undefined);
        const res = mockRes();

        await controller.postDisconnect(mockReq(), res);

        expect(res.json).toHaveBeenCalledWith({ ok: true, message: "WhatsApp desconectado com sucesso" });
    });

    test("lança AppError quando disconnect falha", async () => {
        client.disconnect.mockRejectedValue(new Error("fail"));
        await expect(controller.postDisconnect(mockReq(), mockRes())).rejects.toThrow(AppError);
    });
});

// ─── getMessages ──────────────────────────────────────────────────────────────

describe("WhatsAppController.getMessages", () => {
    test("retorna mensagens com limit padrão", () => {
        client.getReceivedMessages.mockReturnValue([{ id: "1", text: "oi" }]);
        const res = mockRes();

        controller.getMessages(mockReq({}, { limit: "10" }), res);

        expect(client.getReceivedMessages).toHaveBeenCalledWith(10);
        expect(res.json).toHaveBeenCalledWith({
            count: 1,
            messages: [{ id: "1", text: "oi" }],
        });
    });

    test("limita máximo a 200", () => {
        client.getReceivedMessages.mockReturnValue([]);
        const res = mockRes();

        controller.getMessages(mockReq({}, { limit: "999" }), res);

        expect(client.getReceivedMessages).toHaveBeenCalledWith(200);
    });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe("WhatsAppController.getHealthz", () => {
    test("retorna 200 com ok:true", () => {
        const res = mockRes();
        controller.getHealthz(mockReq(), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
});

describe("WhatsAppController.getHealth", () => {
    test("retorna 200 quando ready", () => {
        client.getStatus.mockReturnValue({ ready: true, hasQr: false });
        const res = mockRes();

        controller.getHealth(mockReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            service: "whatsapp-gateway",
            ready: true,
        }));
    });

    test("retorna 503 quando não ready", () => {
        client.getStatus.mockReturnValue({ ready: false, hasQr: true });
        const res = mockRes();

        controller.getHealth(mockReq(), res);

        expect(res.status).toHaveBeenCalledWith(503);
    });
});
