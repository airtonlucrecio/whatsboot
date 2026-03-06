"use strict";

const { lookup } = require("dns").promises;
const net = require("net");

const MAX_TEXT_LENGTH = 4096;
const MAX_FIELD_LENGTH = 255;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

/** Protocolos permitidos para URLs de mídia (previne SSRF com file://, gopher://, etc.) */
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/** Ranges de IP privados / reservados */
const PRIVATE_IP_PATTERNS = [
    /^127\./,                           // loopback
    /^10\./,                            // class A private
    /^192\.168\./,                      // class C private
    /^172\.(1[6-9]|2\d|3[01])\./,      // class B private
    /^169\.254\./,                      // link-local / AWS metadata
    /^0\./,                             // "this" network
    /^fc00:/i,                          // IPv6 ULA
    /^fe80:/i,                          // IPv6 link-local
    /^::1$/,                            // IPv6 loopback
    /^::$/,                             // unspecified
];

function isPrivateIp(ip) {
    return PRIVATE_IP_PATTERNS.some((re) => re.test(ip));
}

function validatePhone(to) {
    const digits = String(to || "").replace(/\D/g, "");
    if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return null;
    return digits;
}

function validateMediaUrl(urlStr) {
    if (!urlStr || typeof urlStr !== "string") {
        return { valid: false, error: "url_required" };
    }

    let parsed;
    try {
        parsed = new URL(urlStr);
    } catch {
        return { valid: false, error: "invalid_url_format" };
    }

    if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
        return { valid: false, error: "url_protocol_not_allowed" };
    }

    // Bloqueia endereços de rede interna (SSRF protection — hostname textual)
    const host = parsed.hostname.toLowerCase();
    if (
        host === "localhost" ||
        host === "0.0.0.0" ||
        host.endsWith(".internal") ||
        host.endsWith(".local") ||
        net.isIP(host) && isPrivateIp(host)
    ) {
        return { valid: false, error: "url_points_to_internal_network" };
    }

    return { valid: true };
}

/**
 * Validação async de DNS — resolve o hostname e checa se aponta para IP privado.
 * Deve ser chamada APÓS validateMediaUrl() para proteção contra DNS rebinding.
 *
 * @param {string} urlStr
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
async function validateMediaUrlDns(urlStr) {
    const syncCheck = validateMediaUrl(urlStr);
    if (!syncCheck.valid) return syncCheck;

    const parsed = new URL(urlStr);
    const host = parsed.hostname;

    // Se já é um IP literal, checar diretamente
    if (net.isIP(host)) {
        return isPrivateIp(host)
            ? { valid: false, error: "url_points_to_internal_network" }
            : { valid: true };
    }

    // Resolve DNS e checa todos os IPs retornados
    try {
        const { address } = await lookup(host);
        if (isPrivateIp(address)) {
            return { valid: false, error: "url_resolves_to_internal_ip" };
        }
    } catch {
        return { valid: false, error: "url_dns_resolution_failed" };
    }

    return { valid: true };
}

function validateText(text) {
    if (!text || typeof text !== "string") {
        return { valid: false, error: "text_required" };
    }
    if (text.length > MAX_TEXT_LENGTH) {
        return { valid: false, error: "text_too_long" };
    }
    return { valid: true };
}

function sanitizeOptionalString(value, maxLen = MAX_FIELD_LENGTH) {
    if (value === null || value === undefined || typeof value !== "string") return null;
    return value.slice(0, maxLen);
}

module.exports = {
    validatePhone,
    validateMediaUrl,
    validateMediaUrlDns,
    validateText,
    sanitizeOptionalString,
    isPrivateIp,
    MAX_TEXT_LENGTH,
    MAX_FIELD_LENGTH,
};
