"use strict";

const { requestId, isValidRequestId, MAX_REQUEST_ID_LENGTH } = require("../src/middleware/requestId");

function mockReq(headers = {}) {
    return { headers };
}

function mockRes() {
    const res = { _headers: {} };
    res.setHeader = jest.fn((name, value) => { res._headers[name] = value; });
    return res;
}

describe("requestId middleware", () => {
    test("gera UUID quando X-Request-Id não enviado", () => {
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        expect(req.id).toBeDefined();
        expect(typeof req.id).toBe("string");
        expect(req.id.length).toBeGreaterThan(0);
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", req.id);
        expect(next).toHaveBeenCalled();
    });

    test("reutiliza X-Request-Id do header se presente e válido", () => {
        const req = mockReq({ "x-request-id": "my-custom-id-123" });
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        expect(req.id).toBe("my-custom-id-123");
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "my-custom-id-123");
    });

    test("gera IDs únicos em chamadas consecutivas", () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            const req = mockReq();
            const res = mockRes();
            requestId(req, res, jest.fn());
            ids.add(req.id);
        }
        expect(ids.size).toBe(100);
    });

    test("rejeita X-Request-Id com caracteres especiais (injection)", () => {
        const req = mockReq({ "x-request-id": "<script>alert(1)</script>" });
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        // Deve ignorar o header malicioso e gerar UUID
        expect(req.id).not.toBe("<script>alert(1)</script>");
        expect(req.id).toMatch(/^[a-f0-9-]+$/);
    });

    test("rejeita X-Request-Id com espaços", () => {
        const req = mockReq({ "x-request-id": "id with spaces" });
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        expect(req.id).not.toBe("id with spaces");
    });

    test("trunca X-Request-Id muito longo", () => {
        const longId = "a".repeat(300);
        const req = mockReq({ "x-request-id": longId });
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        // Deve gerar novo UUID porque o ID excede MAX_REQUEST_ID_LENGTH
        expect(req.id.length).toBeLessThanOrEqual(MAX_REQUEST_ID_LENGTH);
    });

    test("aceita X-Request-Id com UUID válido", () => {
        const uuid = "550e8400-e29b-41d4-a716-446655440000";
        const req = mockReq({ "x-request-id": uuid });
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        expect(req.id).toBe(uuid);
    });

    test("aceita X-Request-Id alfanumérico com underscore", () => {
        const id = "req_abc123_XYZ";
        const req = mockReq({ "x-request-id": id });
        const res = mockRes();
        const next = jest.fn();

        requestId(req, res, next);

        expect(req.id).toBe(id);
    });
});

describe("isValidRequestId", () => {
    test("aceita UUID", () => {
        expect(isValidRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    test("aceita alfanumérico com hífens e underscores", () => {
        expect(isValidRequestId("my-request_123")).toBe(true);
    });

    test("rejeita string vazia", () => {
        expect(isValidRequestId("")).toBe(false);
    });

    test("rejeita null", () => {
        expect(isValidRequestId(null)).toBe(false);
    });

    test("rejeita caracteres especiais", () => {
        expect(isValidRequestId("id<>script")).toBe(false);
        expect(isValidRequestId("id with space")).toBe(false);
        expect(isValidRequestId("id\nnewline")).toBe(false);
    });

    test("rejeita string maior que MAX_REQUEST_ID_LENGTH", () => {
        expect(isValidRequestId("a".repeat(MAX_REQUEST_ID_LENGTH + 1))).toBe(false);
    });

    test("aceita string com exatamente MAX_REQUEST_ID_LENGTH chars", () => {
        expect(isValidRequestId("a".repeat(MAX_REQUEST_ID_LENGTH))).toBe(true);
    });
});
