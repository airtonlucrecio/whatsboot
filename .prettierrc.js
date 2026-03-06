// .prettierrc.js — Prettier config
"use strict";

/** @type {import("prettier").Config} */
module.exports = {
    // Identação com 4 espaços (consistente com o código existente)
    tabWidth: 4,
    useTabs: false,
    // Ponto-e-vírgula obrigatório
    semi: true,
    // Aspas duplas (padrão do codebase)
    singleQuote: false,
    // Trailing comma em ES5+ (objetos e arrays)
    trailingComma: "es5",
    // Print width conservador
    printWidth: 120,
    // Parênteses em arrow functions
    arrowParens: "always",
    // LF como line endings (Unix, compatível com Docker/Linux)
    endOfLine: "lf",
};
