"use strict";

const { buildCandidates, toDirectJid } = require("../src/utils/phoneNormalizer");

describe("phoneNormalizer", () => {
    // ─── buildCandidates ──────────────────────────────────────────────────────

    describe("buildCandidates", () => {
        test("número brasileiro com 13 dígitos (com 9) gera candidato sem 9", () => {
            const result = buildCandidates("5511991234567");
            expect(result).toEqual(["5511991234567", "551191234567"]);
        });

        test("número brasileiro com 12 dígitos (sem 9) gera candidato com 9", () => {
            const result = buildCandidates("551191234567");
            expect(result).toEqual(["551191234567", "5511991234567"]);
        });

        test("número internacional (não-BR) retorna apenas o original", () => {
            const result = buildCandidates("1234567890");
            expect(result).toEqual(["1234567890"]);
        });

        test("remove formatação antes de processar", () => {
            const result = buildCandidates("+55 (11) 99123-4567");
            expect(result).toEqual(["5511991234567", "551191234567"]);
        });

        test("aceita número como number", () => {
            const result = buildCandidates(5511991234567);
            expect(result).toEqual(["5511991234567", "551191234567"]);
        });

        test("número BR com DDD de 2 dígitos curto (11 dígitos) retorna só ele", () => {
            const result = buildCandidates("55119912345");
            expect(result).toEqual(["55119912345"]);
        });

        test("número argentino não gera candidatos extras", () => {
            const result = buildCandidates("5491112345678");
            expect(result).toEqual(["5491112345678"]);
        });
    });

    // ─── toDirectJid ──────────────────────────────────────────────────────────

    describe("toDirectJid", () => {
        test("converte número para JID", () => {
            expect(toDirectJid("5511991234567")).toBe("5511991234567@s.whatsapp.net");
        });

        test("funciona com qualquer string de dígitos", () => {
            expect(toDirectJid("1234567890")).toBe("1234567890@s.whatsapp.net");
        });
    });
});
