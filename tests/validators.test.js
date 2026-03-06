"use strict";

const {
    validatePhone,
    validateMediaUrl,
    validateMediaUrlDns,
    validateText,
    sanitizeOptionalString,
    isPrivateIp,
} = require("../src/utils/validators");

// ─── validatePhone ────────────────────────────────────────────────────────────
describe("validatePhone", () => {
    test("retorna apenas dígitos de um número válido", () => {
        expect(validatePhone("5511991234567")).toBe("5511991234567");
    });

    test("remove formatação (+, espaços, traços)", () => {
        expect(validatePhone("+55 (11) 99123-4567")).toBe("5511991234567");
    });

    test("retorna null se menos de 10 dígitos", () => {
        expect(validatePhone("123")).toBeNull();
    });

    test("retorna null se mais de 15 dígitos", () => {
        expect(validatePhone("12345678901234567")).toBeNull();
    });

    test("retorna null para string vazia", () => {
        expect(validatePhone("")).toBeNull();
    });

    test("retorna null para null", () => {
        expect(validatePhone(null)).toBeNull();
    });

    test("retorna null para undefined", () => {
        expect(validatePhone(undefined)).toBeNull();
    });
});

// ─── validateMediaUrl ─────────────────────────────────────────────────────────
describe("validateMediaUrl", () => {
    test("aceita URL HTTPS pública", () => {
        expect(validateMediaUrl("https://example.com/image.jpg").valid).toBe(true);
    });

    test("aceita URL HTTP pública", () => {
        expect(validateMediaUrl("http://example.com/audio.ogg").valid).toBe(true);
    });

    test("rejeita protocolo file://", () => {
        const result = validateMediaUrl("file:///etc/passwd");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("url_protocol_not_allowed");
    });

    test("rejeita protocolo ftp://", () => {
        const result = validateMediaUrl("ftp://example.com/file.pdf");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("url_protocol_not_allowed");
    });

    test("rejeita localhost (SSRF)", () => {
        expect(validateMediaUrl("http://localhost/secret").valid).toBe(false);
    });

    test("rejeita 0.0.0.0 (SSRF)", () => {
        expect(validateMediaUrl("http://0.0.0.0/secret").valid).toBe(false);
    });

    test("rejeita IP 127.0.0.1 (SSRF)", () => {
        expect(validateMediaUrl("http://127.0.0.1/secret").valid).toBe(false);
    });

    test("rejeita IP 10.x.x.x (SSRF)", () => {
        expect(validateMediaUrl("http://10.0.0.1/data").valid).toBe(false);
    });

    test("rejeita IP 192.168.x.x (SSRF)", () => {
        expect(validateMediaUrl("http://192.168.1.1/secret.pdf").valid).toBe(false);
    });

    test("rejeita 169.254.x.x metadata SSRF", () => {
        expect(validateMediaUrl("http://169.254.169.254/metadata").valid).toBe(false);
    });

    test("rejeita .internal domain", () => {
        expect(validateMediaUrl("http://app.internal/data").valid).toBe(false);
    });

    test("retorna erro para URL inválida", () => {
        expect(validateMediaUrl("not-a-url").valid).toBe(false);
    });

    test("retorna erro para string vazia", () => {
        expect(validateMediaUrl("").valid).toBe(false);
    });
});

// ─── isPrivateIp ──────────────────────────────────────────────────────────────
describe("isPrivateIp", () => {
    test("identifica 127.0.0.1 como privado", () => {
        expect(isPrivateIp("127.0.0.1")).toBe(true);
    });

    test("identifica 10.0.0.1 como privado", () => {
        expect(isPrivateIp("10.0.0.1")).toBe(true);
    });

    test("identifica 192.168.0.1 como privado", () => {
        expect(isPrivateIp("192.168.0.1")).toBe(true);
    });

    test("identifica 172.16.0.1 como privado", () => {
        expect(isPrivateIp("172.16.0.1")).toBe(true);
    });

    test("identifica 169.254.169.254 como privado", () => {
        expect(isPrivateIp("169.254.169.254")).toBe(true);
    });

    test("identifica ::1 como privado", () => {
        expect(isPrivateIp("::1")).toBe(true);
    });

    test("identifica IP público como não-privado", () => {
        expect(isPrivateIp("8.8.8.8")).toBe(false);
    });

    test("identifica 1.1.1.1 como não-privado", () => {
        expect(isPrivateIp("1.1.1.1")).toBe(false);
    });
});

// ─── validateMediaUrlDns ──────────────────────────────────────────────────────
describe("validateMediaUrlDns", () => {
    test("rejeita URL que falha na validação síncrona", async () => {
        const result = await validateMediaUrlDns("ftp://evil.com/file");
        expect(result.valid).toBe(false);
    });

    test("aceita URL pública válida", async () => {
        const result = await validateMediaUrlDns("https://example.com/image.jpg");
        expect(result.valid).toBe(true);
    });
});

// ─── validateText ─────────────────────────────────────────────────────────────
describe("validateText", () => {
    test("aceita texto normal", () => {
        expect(validateText("Olá, mundo!").valid).toBe(true);
    });

    test("rejeita texto vazio", () => {
        expect(validateText("").valid).toBe(false);
    });

    test("rejeita null", () => {
        expect(validateText(null).valid).toBe(false);
    });

    test("aceita texto com exatamente 4096 chars", () => {
        expect(validateText("a".repeat(4096)).valid).toBe(true);
    });

    test("rejeita texto com mais de 4096 chars", () => {
        expect(validateText("a".repeat(4097)).valid).toBe(false);
    });
});

// ─── sanitizeOptionalString ───────────────────────────────────────────────────
describe("sanitizeOptionalString", () => {
    test("retorna null para undefined", () => {
        expect(sanitizeOptionalString(undefined)).toBeNull();
    });

    test("retorna null para null", () => {
        expect(sanitizeOptionalString(null)).toBeNull();
    });

    test("retorna string truncada ao maxLen", () => {
        expect(sanitizeOptionalString("abcdefgh", 4)).toBe("abcd");
    });

    test("retorna string intacta dentro do limite", () => {
        expect(sanitizeOptionalString("abc", 10)).toBe("abc");
    });

    test("retorna null para tipos não-string (número)", () => {
        expect(sanitizeOptionalString(123)).toBeNull();
    });
});
