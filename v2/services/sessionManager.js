// services/sessionManager.js - Gerenciamento de sessões com cache
const fs = require('fs').promises;
const path = require('path');
const { updateSessionStatus, updateLastUsed, logAction } = require('../database/db');

const SESSIONS_DIR = path.join(__dirname, '../sessions');

// Políticas de expiração por player
const SESSION_POLICIES = {
  iboplayer: {
    expiresInHours: parseInt(process.env.SESSION_EXPIRY_IBOPLAYER) || 72,
    testBeforeUse: true
  },
  ibopro: {
    expiresInHours: parseInt(process.env.SESSION_EXPIRY_IBOPRO) || 168,
    testBeforeUse: true
  },
  vuplayer: {
    expiresInHours: parseInt(process.env.SESSION_EXPIRY_VUPLAYER) || 72,
    testBeforeUse: true
  }
};

// Garantir que diretório de sessões existe
async function ensureSessionsDir() {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch (error) {
    // Diretório já existe
  }
}

// Gerar nome do arquivo de sessão
function getSessionFilePath(clientId, playerType) {
  return path.join(SESSIONS_DIR, `client_${clientId}_${playerType}.json`);
}

// Salvar sessão no cache
async function saveSession(clientId, playerType, sessionData) {
  await ensureSessionsDir();
  
  const policy = SESSION_POLICIES[playerType];
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + policy.expiresInHours);
  
  const session = {
    clientId,
    playerType,
    sessionData,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastUsed: new Date().toISOString()
  };
  
  const filePath = getSessionFilePath(clientId, playerType);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  
  // Atualizar status no banco
  await updateSessionStatus(clientId, true, expiresAt.toISOString());
  
  console.log(`✅ Sessão salva: Cliente ${clientId} (${playerType})`);
  return session;
}

// Carregar sessão do cache
async function loadSession(clientId, playerType) {
  try {
    const filePath = getSessionFilePath(clientId, playerType);
    const data = await fs.readFile(filePath, 'utf8');
    const session = JSON.parse(data);
    
    // Atualizar último uso
    session.lastUsed = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    await updateLastUsed(clientId);
    
    return session;
  } catch (error) {
    return null;
  }
}

// Verificar se sessão expirou
function isSessionExpired(session) {
  if (!session || !session.expiresAt) return true;
  return new Date(session.expiresAt) < new Date();
}

// Calcular horas até expirar
function getHoursUntilExpiry(session) {
  if (!session || !session.expiresAt) return 0;
  const now = new Date();
  const expires = new Date(session.expiresAt);
  const diff = expires - now;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
}

// Testar se sessão ainda funciona
async function testSession(session, playerType) {
  try {
    switch (playerType) {
      case 'iboplayer':
        return await testIBOPlayerSession(session);
      case 'ibopro':
        return await testIBOProSession(session);
      case 'vuplayer':
        return await testVUPlayerSession(session);
      default:
        return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao testar sessão ${playerType}:`, error.message);
    return false;
  }
}

// Testar sessão IBOPlayer
async function testIBOPlayerSession(session) {
  const axios = require('axios');
  try {
    const response = await axios.get(
      `https://${session.sessionData.domain}/frontend/device/playlists`,
      {
        headers: {
          'Cookie': session.sessionData.cookies.join('; ')
        },
        timeout: 10000
      }
    );
    return response.data.status === 'Sucess';
  } catch (error) {
    return false;
  }
}

// Testar sessão IBOPro
async function testIBOProSession(session) {
  const https = require('https');
  const { generateAllTokens } = require('./ibopro');
  
  return new Promise(async (resolve) => {
    try {
      const tokens = await generateAllTokens(
        session.sessionData.macAddress,
        session.sessionData.password
      );
      
      const options = {
        hostname: 'api.iboproapp.com',
        path: '/playlistw',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.sessionData.token}`,
          ...tokens
        },
        timeout: 10000
      };
      
      const req = https.request(options, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.on('timeout', () => resolve(false));
      req.end();
    } catch (error) {
      resolve(false);
    }
  });
}

// Testar sessão VU Player
async function testVUPlayerSession(session) {
  const axios = require('axios');
  const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
  
  try {
    const response = await axios.post(CLOUDFLARE_WORKER_URL, {
      url: `https://${process.env.VUPLAYER_DOMAIN || 'vuproplayer.org'}/mylist`,
      method: 'GET',
      headers: {
        'Cookie': session.sessionData.cookie
      }
    }, { timeout: 10000 });
    
    return response.data.status === 200 && response.data.body.includes('<tbody>');
  } catch (error) {
    return false;
  }
}

// Deletar sessão do cache
async function deleteSession(clientId, playerType) {
  try {
    const filePath = getSessionFilePath(clientId, playerType);
    await fs.unlink(filePath);
    await updateSessionStatus(clientId, false, null);
    console.log(`🗑️ Sessão deletada: Cliente ${clientId}`);
  } catch (error) {
    // Arquivo não existe
  }
}

// Limpar sessões expiradas
async function cleanExpiredSessions() {
  await ensureSessionsDir();
  const files = await fs.readdir(SESSIONS_DIR);
  let cleaned = 0;
  
  for (const file of files) {
    try {
      const filePath = path.join(SESSIONS_DIR, file);
      const data = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(data);
      
      if (isSessionExpired(session)) {
        await fs.unlink(filePath);
        await updateSessionStatus(session.clientId, false, null);
        cleaned++;
      }
    } catch (error) {
      console.error(`Erro ao limpar sessão ${file}:`, error.message);
    }
  }
  
  if (cleaned > 0) {
    console.log(`🗑️ ${cleaned} sessão(ões) expirada(s) deletada(s)`);
  }
  
  return cleaned;
}

// Obter sessão válida (principal função)
async function getValidSession(client, loginFunction) {
  const { id, player_type } = client;
  
  // 1. Tentar carregar do cache
  const cachedSession = await loadSession(id, player_type);
  
  if (!cachedSession) {
    console.log(`🔐 Cliente ${id}: Nenhuma sessão em cache, fazendo login...`);
    await logAction(id, 'login', true, 'Primeira sessão criada');
    return await loginAndSaveSession(client, loginFunction);
  }
  
  // 2. Verificar expiração
  if (isSessionExpired(cachedSession)) {
    console.log(`⏰ Cliente ${id}: Sessão expirada, renovando...`);
    await deleteSession(id, player_type);
    await logAction(id, 'login', true, 'Sessão expirada - renovada');
    return await loginAndSaveSession(client, loginFunction);
  }
  
  // 3. Testar se ainda funciona
  const policy = SESSION_POLICIES[player_type];
  if (policy.testBeforeUse) {
    const isValid = await testSession(cachedSession, player_type);
    
    if (!isValid) {
      console.log(`❌ Cliente ${id}: Sessão inválida, fazendo novo login...`);
      await deleteSession(id, player_type);
      await logAction(id, 'login', true, 'Sessão inválida - renovada');
      return await loginAndSaveSession(client, loginFunction);
    }
  }
  
  // 4. Sessão válida!
  const hoursLeft = getHoursUntilExpiry(cachedSession);
  console.log(`✅ Cliente ${id}: Sessão em cache válida! (expira em ${hoursLeft}h)`);
  await logAction(id, 'session_reused', true, `Sessão reutilizada (${hoursLeft}h restantes)`);
  
  return cachedSession;
}

// Fazer login e salvar sessão
async function loginAndSaveSession(client, loginFunction) {
  try {
    const sessionData = await loginFunction(client);
    const session = await saveSession(client.id, client.player_type, sessionData);
    return session;
  } catch (error) {
    await logAction(client.id, 'login', false, error.message);
    throw error;
  }
}

module.exports = {
  saveSession,
  loadSession,
  deleteSession,
  isSessionExpired,
  getHoursUntilExpiry,
  testSession,
  cleanExpiredSessions,
  getValidSession,
  SESSION_POLICIES
};
