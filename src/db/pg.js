"use strict";

const postgres = require("postgres");
const config = require("../config");
const logger = require("../utils/logger");

const sql = postgres(config.databaseUrl, {
    max: config.dbPoolMax,
    idle_timeout: 30,
    connect_timeout: 5,
    ssl: config.dbSsl || undefined,
    onnotice: () => {},
});

logger.debug("Postgres.js configurado");

module.exports = { sql };