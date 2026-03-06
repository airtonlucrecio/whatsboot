"use strict";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../src/config", () => ({
    databaseUrl: "postgres://mock",
    dbPoolMax: 2,
    dbSsl: "",
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
    getLogs: jest.fn(),
    getStats: jest.fn(),
    getLogById: jest.fn(),
}));

const logController = require("../src/controllers/LogController");
const { getLogs, getStats, getLogById } = require("../src/services/messageService");
const { ValidationError, NotFoundError, AppError } = require("../src/utils/errors");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(query = {}, params = {}) {
    return { query, params, path: "/logs", id: "req-1" };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// ─── list ─────────────────────────────────────────────────────────────────────

describe("LogController.list", () => {
    beforeEach(() => jest.clearAllMocks());

    test("retorna logs com parâmetros padrão", async () => {
        getLogs.mockResolvedValue({ rows: [{ id: 1 }], nextCursor: null, hasMore: false });
        const res = mockRes();

        await logController.list(mockReq(), res);

        expect(getLogs).toHaveBeenCalledWith({ status: undefined, limit: 50, cursor: null });
        expect(res.json).toHaveBeenCalledWith({ rows: [{ id: 1 }], nextCursor: null, hasMore: false });
    });

    test("passa status e cursor da query", async () => {
        getLogs.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
        const res = mockRes();

        await logController.list(mockReq({ status: "sent", limit: "10", cursor: "50" }), res);

        expect(getLogs).toHaveBeenCalledWith({ status: "sent", limit: 10, cursor: 50 });
    });

    test("lança ValidationError para status inválido", async () => {
        getLogs.mockRejectedValue(new ValidationError("Status inválido"));
        await expect(logController.list(mockReq({ status: "bad" }), mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança AppError para erro genérico de banco", async () => {
        getLogs.mockRejectedValue(new Error("DB_DOWN"));
        await expect(logController.list(mockReq(), mockRes())).rejects.toThrow(AppError);
    });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe("LogController.getById", () => {
    beforeEach(() => jest.clearAllMocks());

    test("retorna log encontrado", async () => {
        getLogById.mockResolvedValue({ id: 42, status: "sent" });
        const res = mockRes();

        await logController.getById(mockReq({}, { id: "42" }), res);

        expect(getLogById).toHaveBeenCalledWith(42);
        expect(res.json).toHaveBeenCalledWith({ id: 42, status: "sent" });
    });

    test("lança NotFoundError para log inexistente", async () => {
        getLogById.mockResolvedValue(null);
        await expect(logController.getById(mockReq({}, { id: "999" }), mockRes())).rejects.toThrow(NotFoundError);
    });

    test("lança ValidationError para ID inválido (texto)", async () => {
        await expect(logController.getById(mockReq({}, { id: "abc" }), mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para ID negativo", async () => {
        await expect(logController.getById(mockReq({}, { id: "-1" }), mockRes())).rejects.toThrow(ValidationError);
    });

    test("lança ValidationError para ID zero", async () => {
        await expect(logController.getById(mockReq({}, { id: "0" }), mockRes())).rejects.toThrow(ValidationError);
    });
});

// ─── stats ────────────────────────────────────────────────────────────────────

describe("LogController.stats", () => {
    beforeEach(() => jest.clearAllMocks());

    test("retorna stats corretamente", async () => {
        const data = [{ status: "sent", count: 100 }, { status: "failed", count: 5 }];
        getStats.mockResolvedValue(data);
        const res = mockRes();

        await logController.stats(mockReq(), res);

        expect(res.json).toHaveBeenCalledWith(data);
    });

    test("lança AppError quando stats falha", async () => {
        getStats.mockRejectedValue(new Error("DB_DOWN"));
        await expect(logController.stats(mockReq(), mockRes())).rejects.toThrow(AppError);
    });
});
