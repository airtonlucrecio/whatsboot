const { Queue } = require("bullmq");
const { createRedisConnection } = require("./redis");

const whatsappQueue = new Queue("whatsapp-send", {
    connection: createRedisConnection(),
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 500,
    },
});

module.exports = { whatsappQueue };