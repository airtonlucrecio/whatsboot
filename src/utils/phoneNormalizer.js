"use strict";

/**
 * phoneNormalizer.js
 *
 * Normaliza números de telefone para formato de JID do WhatsApp.
 * Gera candidatos com/sem o dígito "9" para números brasileiros (55).
 *
 * Isolado do WhatsApp client para facilitar testes unitários e reuso.
 */

/**
 * Gera lista de candidatos de número para resolução de JID.
 * Lida com a variação do 9º dígito em números brasileiros.
 *
 * @param {string|number} to - Número do destinatário (pode conter formatação)
 * @returns {string[]} Lista de candidatos (dígitos puros)
 *
 * @example
 * buildCandidates("5511991234567") // => ["5511991234567", "551191234567"]
 * buildCandidates("551191234567")  // => ["551191234567", "5511991234567"]
 * buildCandidates("1234567890")    // => ["1234567890"]
 */
function buildCandidates(to) {
    const digits = String(to).replace(/\D/g, "");
    const candidates = [digits];

    // Números brasileiros (DDI 55): variação do 9º dígito
    if (digits.startsWith("55") && digits.length === 12) {
        // Sem o 9 → adiciona o 9 após o DDD (posição 4)
        candidates.push(digits.slice(0, 4) + "9" + digits.slice(4));
    } else if (digits.startsWith("55") && digits.length === 13) {
        // Com o 9 → remove o 9 após o DDD (posição 4)
        candidates.push(digits.slice(0, 4) + digits.slice(5));
    }

    return candidates;
}

/**
 * Converte número para JID direto (fallback sem verificação onWhatsApp).
 *
 * @param {string} digits - Número apenas com dígitos
 * @returns {string} JID no formato number@s.whatsapp.net
 */
function toDirectJid(digits) {
    return `${digits}@s.whatsapp.net`;
}

module.exports = { buildCandidates, toDirectJid };
