"use strict";

// ─── Mocks devem vir antes dos requires ──────────────────────────────────────

jest.mock("../src/config", () => ({
    databaseUrl: "postgres://mock",
    dbPoolMax: 2,
    dbSsl: "",
    redisUrl: "",
    redisHost: "localhost",
    redisPort: 6379,
    redisPassword: "",
    queueAttempts: 3,
    queueBackoffDelay: 1000,
    queueRetentionCount: 100,
    rateLimitMax: 1,
    rateLimitDurationMs: 1000,
    apiKey: "test-key",
    corsOrigin: "http://localhost",
    webhookUrl: "",
    webhookToken: "",
    webhookTimeoutMs: 5000,
}));

jest.mock("../src/utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock("../src/db/pg", () => {
    const sqlMock = jest.fn().mockResolvedValue([]);
    return { sql: sqlMock };
});

jest.mock("../src/whatsapp/client", () => ({
    sendText: jest.fn(),
}));

jest.mock("../src/utils/webhook", () => ({
    dispatchWebhook: jest.fn(),
}));

// Mock BullMQ Worker — captura o processor e listeners
const mockWorkerInstance = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
};
jest.mock("bullmq", () => ({
    Worker: jest.fn().mockImplementation((_name, processor, _opts) => {
        mockWorkerInstance._processor = processor;
        return mockWorkerInstance;
    }),
}));

jest.mock("../src/queue/redis", () => ({
    createRedisConnection: jest.fn(() => ({})),
}));

const { createWorker } = require("../src/queue/worker");
const { sendText } = require("../src/whatsapp/client");
const { sql } = require("../src/db/pg");
const { dispatchWebhook } = require("../src/utils/webhook");

describe("createWorker", () => {
    let closeWorker;
    // Salvar referências dos handlers ANTES do clearAllMocks apagar
    let completedHandler;
    let failedHandler;

    beforeAll(() => {
        const result = createWorker();
        closeWorker = result.closeWorker;

        // Captura handlers registrados durante createWorker()
        completedHandler = mockWorkerInstance.on.mock.calls.find(([evt]) => evt === "completed")[1];
        failedHandler = mockWorkerInstance.on.mock.calls.find(([evt]) => evt === "failed")[1];
    });

    test("cria Worker com nome correto e registra event listeners", () => {
        const { Worker } = require("bullmq");
        expect(Worker).toHaveBeenCalledWith(
            "whatsapp-send",
            expect.any(Function),
            expect.objectContaining({
                limiter: expect.objectContaining({ max: 1, duration: 1000 }),
            }),
        );
        expect(mockWorkerInstance.on).toHaveBeenCalledWith("completed", expect.any(Function));
        expect(mockWorkerInstance.on).toHaveBeenCalledWith("failed", expect.any(Function));
        expect(mockWorkerInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
    });

    test("processor atualiza status para 'sent' quando sendText sucede", async () => {
        sendText.mockResolvedValueOnce({ ok: true, messageId: "msg-1" });
        sql.mockResolvedValueOnce([]);

        const job = {
            data: { logId: 1, to: "5511999999999", text: "Olá" },
            attemptsMade: 0,
            opts: { attempts: 3 },
        };

        const result = await mockWorkerInstance._processor(job);
        expect(result).toEqual({ ok: true });
        expect(sendText).toHaveBeenCalledWith("5511999999999", "Olá");
        expect(sql).toHaveBeenCalled();
    });

    test("processor atualiza status para 'retrying' quando falha mas não é última tentativa", async () => {
        sendText.mockRejectedValueOnce(new Error("timeout"));
        sql.mockResolvedValueOnce([]);

        const job = {
            data: { logId: 2, to: "5511999999999", text: "Teste" },
            attemptsMade: 0,
            opts: { attempts: 3 },
        };

        await expect(mockWorkerInstance._processor(job)).rejects.toThrow("timeout");
    });

    test("processor atualiza status para 'failed' na última tentativa", async () => {
        sendText.mockRejectedValueOnce(new Error("final error"));
        sql.mockResolvedValueOnce([]);

        const job = {
            data: { logId: 3, to: "5511999999999", text: "Teste" },
            attemptsMade: 2, // 3rd attempt (0-indexed)
            opts: { attempts: 3 },
        };

        await expect(mockWorkerInstance._processor(job)).rejects.toThrow("final error");
    });

    test("closeWorker encerra o worker BullMQ", async () => {
        await closeWorker();
        expect(mockWorkerInstance.close).toHaveBeenCalled();
    });

    test("event listener completed dispara webhook", () => {
        const job = { id: "job-1", data: { logId: 10, to: "5511999", text: "ok" } };

        completedHandler(job);

        expect(dispatchWebhook).toHaveBeenCalledWith("message.sent", expect.objectContaining({
            logId: 10,
            jobId: "job-1",
        }));
    });

    test("event listener failed dispara webhook na última tentativa", () => {
        const job = {
            id: "job-2",
            data: { logId: 11, to: "5511999", text: "fail" },
            attemptsMade: 3,
            opts: { attempts: 3 },
        };
        const err = new Error("dead");

        failedHandler(job, err);

        expect(dispatchWebhook).toHaveBeenCalledWith("message.failed", expect.objectContaining({
            logId: 11,
            error: "dead",
        }));
    });
});
