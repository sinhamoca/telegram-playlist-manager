// index.js - Inicialização do bot
const bot = require('./bot');

console.log('🤖 Iniciando Telegram IPTV Bot...');

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
  process.exit(1);
});

// Iniciar bot
bot.launch()
  .then(() => {
    console.log('✅ Bot iniciado com sucesso!');
    console.log('📱 Aguardando mensagens...');
  })
  .catch((error) => {
    console.error('❌ Erro ao iniciar bot:', error);
    process.exit(1);
  });

// Graceful stop
process.once('SIGINT', () => {
  console.log('\n⏹️  Parando bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n⏹️  Parando bot...');
  bot.stop('SIGTERM');
});
