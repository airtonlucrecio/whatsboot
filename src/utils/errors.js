"use strict";

/**
 * Hierarquia de erros da aplicação.
 * Todas as classes estendem AppError, que estende Error nativo.
 * O error handler do Express usa `statusCode` e `code` para montar a resposta.
 */

class AppError extends Error {
    /**
     * @param {string} message   - Mensagem interna (log)
     * @param {number} statusCode - HTTP status code
     * @param {string} code       - Código de erro para o cliente (ex: "validation_error")
     * @param {object} [details]  - Dados extras opcionais para o corpo da resposta
     */
    constructor(message, statusCode = 500, code = "internal_error", details = undefined) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }

    /** Serializa para JSON na resposta HTTP */
    toJSON() {
        const body = { error: this.code, message: this.message };
        if (this.details) body.details = this.details;
        return body;
    }
}

class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, "validation_error", details);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = "Não autorizado") {
        super(message, 401, "unauthorized");
    }
}

class NotFoundError extends AppError {
    constructor(message = "Recurso não encontrado") {
        super(message, 404, "not_found");
    }
}

class ConflictError extends AppError {
    constructor(message = "Conflito de recurso") {
        super(message, 409, "conflict");
    }
}

class TooManyRequestsError extends AppError {
    constructor(message = "Tente novamente em instantes") {
        super(message, 429, "too_many_requests");
    }
}

class ServiceUnavailableError extends AppError {
    constructor(message = "Serviço indisponível") {
        super(message, 503, "service_unavailable");
    }
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    NotFoundError,
    ConflictError,
    TooManyRequestsError,
    ServiceUnavailableError,
};
