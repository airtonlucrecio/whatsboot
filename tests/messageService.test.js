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
    queueAttempts: 5,
    queueBackoffDelay: 2000,
    queueRetentionCount: 500,
    apiKey: "test-key",
    corsOrigin: "http://localhost",
    webhookUrl: "",
    webhookToken: "",
    webhookTimeoutMs: 5000,
}));

jest.mock("../src/db/pg", () => {
    // O postgres.js usa tagged template literals: sql`query`.
    // getLogs chama sql múltiplas vezes (fragments + query principal).
    // Default retorna [] para fragments intermediários; testes configuram
    // o retorno da query principal via mockReturnValue/mockReturnValueOnce.
    const sqlMock = jest.fn(() => []);
    return { sql: sqlMock };
});

jest.mock("../src/queue/whatsappQueue", () => ({
    whatsappQueue: { add: jest.fn() },
}));

jest.mock("../src/utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { queueTextMessage, getLogs, getStats } = require("../src/services/messageService");
const { sql } = require("../src/db/pg");
const { whatsappQueue } = require("../src/queue/whatsappQueue");
const { ValidationError } = require("../src/utils/errors");

// ─── queueTextMessage ────────────────────────────────────────────────────────

describe("queueTextMessage", () => {
    beforeEach(() => jest.clearAllMocks());

    test("insere log, adiciona à fila e retorna { logId, jobId }", async () => {
        sql.mockReturnValueOnce([{ id: 42 }]);
        whatsappQueue.add.mockResolvedValueOnce({ id: "job-99" });
        sql.mockReturnValueOnce([]);

        const result = await queueTextMessage({ to: "5511999999999", text: "Olá", source: "api", requestId: "req-1" });

        expect(result).toEqual({ logId: 42, jobId: "job-99" });
        expect(sql).toHaveBeenCalledTimes(2);
        expect(whatsappQueue.add).toHaveBeenCalledWith("send-text", expect.objectContaining({ logId: 42, to: "5511999999999", text: "Olá" }));
    });

    test("propaga erro se sql falhar", async () => {
        sql.mockImplementationOnce(() => { throw new Error("DB_DOWN"); });
        await expect(queueTextMessage({ to: "5511999999999", text: "Teste" })).rejects.toThrow("DB_DOWN");
    });
});

// ─── getLogs ──────────────────────────────────────────────────────────────────

describe("getLogs", () => {
    beforeEach(() => jest.clearAllMocks());

    test("retorna rows sem cursor quando não há próxima página", async () => {
        const fakeRows = [{ id: 5, status: "sent" }, { id: 4, status: "queued" }];
        // mockReturnValue (persistente) — getLogs chama sql N vezes (fragments + query);
        // a última chamada (query principal) recebe fakeRows via await.
        sql.mockReturnValue(fakeRows);

        const result = await getLogs({ limit: 50 });

        expect(result.rows).toEqual(fakeRows);
        expect(result.hasMore).toBe(false);
        expect(result.nextCursor).toBeNull();
    });

    test("retorna hasMore=true e nextCursor quando há mais registros", async () => {
        const fakeRows = [{ id: 10 }, { id: 9 }, { id: 8 }];
        sql.mockReturnValue(fakeRows);

        const result = await getLogs({ limit: 2 });

        expect(result.hasMore).toBe(true);
        expect(result.rows).toHaveLength(2);
        expect(result.nextCursor).toBe(9);
    });

    test("lança ValidationError para status inválido", async () => {
        await expect(getLogs({ status: "invalid_status" })).rejects.toBeInstanceOf(ValidationError);
    });

    test("aceita status válido 'sent'", async () => {
        sql.mockReturnValue([]);
        await expect(getLogs({ status: "sent" })).resolves.toEqual({ rows: [], nextCursor: null, hasMore: false });
    });
});

// ─── getStats ────────────────────────────────────────────────────────────────

describe("getStats", () => {
    beforeEach(() => jest.clearAllMocks());

    test("retorna todos os status com contagens", async () => {
        sql.mockReturnValueOnce([
            { status: "sent", count: 100 },
            { status: "failed", count: 5 },
        ]);

        const result = await getStats();
        const byStatus = Object.fromEntries(result.map(({ status, count }) => [status, count]));

        expect(byStatus.sent).toBe(100);
        expect(byStatus.failed).toBe(5);
        expect(byStatus.queued).toBe(0);
        expect(byStatus.retrying).toBe(0);
    });

    test("retorna array mesmo quando banco retorna vazio", async () => {
        sql.mockReturnValueOnce([]);
        const result = await getStats();
        expect(Array.isArray(result)).toBe(true);
        expect(result.every(r => r.count === 0)).toBe(true);
    });
});
