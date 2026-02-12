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
