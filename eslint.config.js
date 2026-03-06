// eslint.config.js — ESLint 9 flat config (Node.js / CommonJS)
"use strict";

const js = require("@eslint/js");
const globals = require("globals");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
    // Arquivos ignorados
    {
        ignores: ["node_modules/**", "auth/**", "*.config.js", "eslint.config.js"],
    },
    // Base recomendada
    js.configs.recommended,
    // Regras do projeto
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
        rules: {
            // Proibir console.log direto (há o logger pino)
            "no-console": ["warn", { allow: ["error"] }],
            // Capturar variáveis não utilizadas (exceto _ e args de callback)
            "no-unused-vars": ["error", { vars: "all", args: "after-used", ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
            // Evitar eval
            "no-eval": "error",
            // Retorno inconsistente
            "consistent-return": "warn",
            // Igualdade estrita
            "eqeqeq": ["error", "always"],
            // Evitar var
            "no-var": "error",
            // Preferir const
            "prefer-const": ["error", { destructuring: "any" }],
        },
    },
    // Overrides para arquivos de teste
    {
        files: ["tests/**/*.js", "**/*.test.js"],
        languageOptions: {
            globals: {
                ...globals.jest,
            },
        },
        rules: {
            "no-unused-vars": "off",
        },
    },
];
