"use strict";

const {
    AppError,
    ValidationError,
    UnauthorizedError,
    NotFoundError,
    ConflictError,
    TooManyRequestsError,
    ServiceUnavailableError,
} = require("../src/utils/errors");

describe("Error classes", () => {
    test("AppError tem statusCode, code e toJSON", () => {
        const err = new AppError("falhou", 500, "internal_error");

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(AppError);
        expect(err.message).toBe("falhou");
        expect(err.statusCode).toBe(500);
        expect(err.code).toBe("internal_error");
        expect(err.name).toBe("AppError");
        expect(err.toJSON()).toEqual({ error: "internal_error", message: "falhou" });
    });

    test("AppError com details inclui no toJSON", () => {
        const err = new AppError("msg", 400, "bad", { field: "x" });
        expect(err.toJSON().details).toEqual({ field: "x" });
    });

    test("ValidationError é 400", () => {
        const err = new ValidationError("campo obrigatório");
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe("validation_error");
        expect(err).toBeInstanceOf(AppError);
    });

    test("UnauthorizedError é 401", () => {
        const err = new UnauthorizedError();
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe("unauthorized");
    });

    test("NotFoundError é 404", () => {
        const err = new NotFoundError();
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe("not_found");
    });

    test("ConflictError é 409", () => {
        const err = new ConflictError();
        expect(err.statusCode).toBe(409);
    });

    test("TooManyRequestsError é 429", () => {
        const err = new TooManyRequestsError();
        expect(err.statusCode).toBe(429);
    });

    test("ServiceUnavailableError é 503", () => {
        const err = new ServiceUnavailableError();
        expect(err.statusCode).toBe(503);
    });

    test("Todas herdam de AppError", () => {
        const classes = [ValidationError, UnauthorizedError, NotFoundError, ConflictError, TooManyRequestsError, ServiceUnavailableError];
        for (const Cls of classes) {
            expect(new Cls()).toBeInstanceOf(AppError);
            expect(new Cls()).toBeInstanceOf(Error);
        }
    });

    test("Tem stack trace correta", () => {
        const err = new ValidationError("teste");
        expect(err.stack).toBeDefined();
        expect(err.stack).not.toContain("AppError");
    });
});
