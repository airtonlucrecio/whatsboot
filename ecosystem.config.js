module.exports = {
    apps: [
        {
            name: "whatsapp-gateway",
            script: "src/server.js",
            instances: 1,
            watch: false,
            max_memory_restart: "512M",
            restart_delay: 5000,
            max_restarts: 50,
            min_uptime: "10s",
            kill_timeout: 5000,
            exp_backoff_restart_delay: 100,
            // Logs explícitos para facilitar debug e rotação
            out_file: "./logs/out.log",
            error_file: "./logs/error.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
            merge_logs: true,
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
