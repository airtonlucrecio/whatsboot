"use strict";

jest.mock("../src/config", () => ({
    apiKey: "test-secret-key-12345",
}));

jest.mock("../src/utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { auth } = require("../src/middleware/auth");
const { UnauthorizedError } = require("../src/utils/errors");

function mockReq(headers = {}) {
    return {
        headers,
        ip: "127.0.0.1",
        path: "/test",
        id: "req-123",
    };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe("auth middleware", () => {
    test("chama next() quando API key é válida", () => {
        const req = mockReq({ "x-api-key": "test-secret-key-12345" });
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(next).toHaveBeenCalledTimes(1);
    });

    test("chama next(UnauthorizedError) quando API key está ausente", () => {
        const req = mockReq({});
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    test("chama next(UnauthorizedError) quando API key é inválida", () => {
        const req = mockReq({ "x-api-key": "wrong-key-same-length!" });
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    test("chama next(UnauthorizedError) quando tamanho da key difere", () => {
        const req = mockReq({ "x-api-key": "short" });
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    test("não aceita API key via query string (removido por segurança)", () => {
        const req = mockReq({});
        req.query = { api_key: "test-secret-key-12345" };
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        // Deve rejeitar mesmo com key correta na query
        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    test("aceita token via Authorization: Bearer", () => {
        const req = mockReq({ authorization: "Bearer test-secret-key-12345" });
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(next).toHaveBeenCalledTimes(1);
    });

    test("rejeita Bearer com token inválido", () => {
        const req = mockReq({ authorization: "Bearer wrong-key-same-length!" });
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    test("x-api-key tem prioridade sobre Authorization", () => {
        const req = mockReq({
            "x-api-key": "test-secret-key-12345",
            authorization: "Bearer wrong-key-same-length!",
        });
        const res = mockRes();
        const next = jest.fn();

        auth(req, res, next);

        expect(next).toHaveBeenCalledWith();
    });
});
