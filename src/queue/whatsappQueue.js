"use strict";

const { Queue } = require("bullmq");
const { createRedisConnection } = require("./redis");
const config = require("../config");

const whatsappQueue = new Queue("whatsapp-send", {
    connection: createRedisConnection(),
    defaultJobOptions: {
        attempts: config.queueAttempts,
        backoff: { type: "exponential", delay: config.queueBackoffDelay },
        removeOnComplete: config.queueRetentionCount,
        removeOnFail: config.queueRetentionCount,
    },
});

module.exports = { whatsappQueue };