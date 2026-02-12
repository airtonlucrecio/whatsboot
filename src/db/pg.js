const postgres = require("postgres");
const logger = require("../utils/logger");

const sql = postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 5,
    ssl: "require",
    onnotice: () => {},       // silencia notices do PG
});

logger.debug("Postgres.js configurado");

module.exports = { sql };