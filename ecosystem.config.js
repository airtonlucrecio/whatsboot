module.exports = {
    apps: [
        {
            name: "whatsapp-gateway",
            script: "src/server.js",
            instances: 1, // NUNCA use mais de 1 — só pode ter 1 conexão WhatsApp
            autorestart: true,
            watch: false,
            max_memory_restart: "512M",
            restart_delay: 5000,         // espera 5s antes de reiniciar
            max_restarts: 50,            // máximo de restarts seguidos
            min_uptime: "10s",           // se rodar menos de 10s, conta como crash
            kill_timeout: 5000,          // tempo para graceful shutdown
            exp_backoff_restart_delay: 100, // backoff exponencial no restart
            env: {
                NODE_ENV: "production",
                LOG_LEVEL: "info",
            },
            env_development: {
                NODE_ENV: "development",
                LOG_LEVEL: "debug",
            },
        },
    ],
};
