module.exports = {
  apps: [
    {
      name: 'iptv-bot',
      script: 'index.js',
      cwd: '/root/telegram-playlistmanager',
      
      // Reiniciar automaticamente se crashar
      autorestart: true,
      watch: false,
      
      // Máximo de reinícios em caso de erro
      max_restarts: 10,
      restart_delay: 5000,
      
      // Modo de execução
      exec_mode: 'fork',
      instances: 1,
      
      // Memória máxima (reinicia se exceder)
      max_memory_restart: '200M',
      
      // Variáveis de ambiente
      env: {
        NODE_ENV: 'production'
      },
      
      // Logs
      log_file: '/root/telegram-playlistmanager/logs/combined.log',
      error_file: '/root/telegram-playlistmanager/logs/error.log',
      out_file: '/root/telegram-playlistmanager/logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      
      // Ignorar arquivos no watch (se ativar watch: true)
      ignore_watch: [
        'node_modules',
        'logs',
        'sessions',
        'database/*.db',
        'downloads'
      ]
    }
  ]
};
