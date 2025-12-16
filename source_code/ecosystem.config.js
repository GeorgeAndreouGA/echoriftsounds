module.exports = {
  apps: [{
    name: 'echoriftsounds',
    script: 'server.js',
    instances: 'max', // Use all available CPU cores
    exec_mode: 'cluster',
    // PM2 Runtime specific settings for Docker
    pm2_home: '/app/.pm2',
    // Logging
    log_file: '/app/logs/combined.log',
    out_file: '/app/logs/out.log',
    error_file: '/app/logs/error.log',
    // Process management
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Auto restart
    autorestart: true,
    watch: false
  }]
};
