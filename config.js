// config.js - Configuração centralizada
const fs = require('fs');
const path = require('path');

// Carregar .env
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn('⚠️  Arquivo .env não encontrado. Use .env.example como base.');
  }
}

loadEnv();

// Validar configurações obrigatórias
function validateConfig() {
  const required = ['TELEGRAM_BOT_TOKEN', 'ADMIN_TELEGRAM_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Configurações obrigatórias faltando no .env:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }
  
  if (process.env.USE_CLOUDFLARE_WORKER !== 'false' && !process.env.CLOUDFLARE_WORKER_URL) {
    console.error('❌ CLOUDFLARE_WORKER_URL não configurado!');
    console.error('   Configure no .env ou desative USE_CLOUDFLARE_WORKER');
    process.exit(1);
  }
}

module.exports = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    adminId: parseInt(process.env.ADMIN_TELEGRAM_ID)
  },
  
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, 'database/iptv.db')
  },
  
  sessions: {
    expiryHours: {
      iboplayer: parseInt(process.env.SESSION_EXPIRY_IBOPLAYER) || 72,
      ibopro: parseInt(process.env.SESSION_EXPIRY_IBOPRO) || 168,
      vuplayer: parseInt(process.env.SESSION_EXPIRY_VUPLAYER) || 72
    }
  },
  
  validateConfig
};
