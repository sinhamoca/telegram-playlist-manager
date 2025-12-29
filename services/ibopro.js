// services/ibopro.js - Integração com IBOPro
const https = require('https');
const { sha3_512 } = require('js-sha3');

const API_BASE = process.env.IBOPRO_API_BASE || 'api.iboproapp.com';

// ========== FUNÇÕES DE HASH (algoritmo específico do IBOPro) ==========

function F(t) {
  if (t.length >= 6) {
    return t.substring(0, 3) + "iBo" + t.substring(3, t.length - 3) + "PrO" + t.substring(t.length - 3, t.length);
  }
  if (t.length >= 3) {
    return t.substring(0, 3) + "iBo" + t.substring(3);
  }
  return t + "PrO";
}

function T(t) {
  const encoded = F(t);
  return F(Buffer.from(encoded).toString('base64'));
}

async function L(e) {
  const n = Date.now().toString();
  const o = T(e + n);
  const normalized = o.normalize();
  const r = sha3_512(normalized);
  return T(r + n);
}

async function generateAllTokens(mac, password) {
  const timestamp = Date.now();
  mac = mac || '';
  password = password || '';
  
  const gcToken = await L(`${mac}${timestamp}${2 * timestamp}`);
  const hash1 = await L(`${mac}___${password}`);
  const hash2 = await L(`${mac}___${password}__${timestamp}`);
  const token1 = await L(`${mac}${timestamp}`);
  const token2 = await L(mac);
  const token3 = T(mac);
  
  return {
    'X-Gc-Token': gcToken,
    'x-hash': hash1,
    'x-hash-2': hash2,
    'x-token': token1,
    'x-token-2': token2,
    'x-token-3': token3
  };
}

// ========== REQUISIÇÕES ==========

function makeRequest(method, path, tokens, data = null, sessionToken = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://iboplayer.pro',
        'Referer': 'https://iboplayer.pro/',
        'Authorization': sessionToken ? `Bearer ${sessionToken}` : 'Bearer',
        ...tokens
      }
    };
    
    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    const req = https.request(options, (res) => {
      let response = '';
      
      res.on('data', (chunk) => {
        response += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(response));
          } catch (e) {
            resolve(response);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${response}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// ========== LOGIN ==========

async function login(client) {
  const { mac_address, password } = client;
  
  const tokens = await generateAllTokens(mac_address, password);
  
  try {
    const response = await makeRequest('POST', '/auth/login', tokens, {
      mac: mac_address,
      password: password
    });
    
    if (!response.status || !response.token) {
      throw new Error('Login falhou: ' + (response.message || 'Token não recebido'));
    }
    
    return {
      macAddress: mac_address,
      password: password,
      token: response.token,
      loginTime: new Date().toISOString(),
      userData: response.user
    };
    
  } catch (error) {
    throw new Error(`Erro ao fazer login: ${error.message}`);
  }
}

// ========== PLAYLISTS ==========

async function listPlaylists(session) {
  const tokens = await generateAllTokens(session.macAddress, session.password);
  
  console.log('🔍 IBOPro listPlaylists - Session:', {
    macAddress: session.macAddress,
    hasToken: !!session.token
  });
  
  const response = await makeRequest('GET', '/playlistw', tokens, null, session.token);
  
  console.log('📥 IBOPro listPlaylists - Response:', JSON.stringify(response, null, 2));
  
  // A resposta é um array direto, não tem .playlists!
  if (!Array.isArray(response) || response.length === 0) {
    console.log('⚠️  IBOPro: Nenhuma playlist encontrada na resposta');
    return [];
  }
  
  console.log(`✅ IBOPro: ${response.length} playlist(s) encontrada(s)`);
  
  return response.map(p => ({
    id: p.id || p._id,
    name: p.name || p.playlist_name,
    url: p.url || p.playlist_url,
    type: p.type || p.playlist_type || 'URL',
    is_protected: p.is_protected === true || p.is_protected === 1,
    pin: p.pin || ''
  }));
}

async function addPlaylist(session, options) {
  const { name, url, pin = '', protect = false, type = 'URL' } = options;
  
  const tokens = await generateAllTokens(session.macAddress, session.password);
  
  // Payload igual ao CLI original
  const payload = {
    mac_address: session.macAddress,
    playlist_name: name,
    playlist_url: url,
    playlist_type: type,
    type: type,
    is_protected: protect,
    pin: pin,
    playlist_id: null,
    playlist_host: '',
    playlist_username: '',
    playlist_password: ''
  };
  
  // Endpoint correto é /playlistw (mesmo de listar!)
  const response = await makeRequest('POST', '/playlistw', tokens, payload, session.token);
  
  return response;
}

async function editPlaylist(session, playlistId, options) {
  const { name, url, pin = '', protect = false, type = 'URL' } = options;
  
  const tokens = await generateAllTokens(session.macAddress, session.password);
  
  // Payload igual ao CLI - POST em /playlistw com playlist_id
  const payload = {
    mac_address: session.macAddress,
    playlist_id: playlistId,
    playlist_name: name,
    playlist_url: url,
    playlist_type: type,
    type: type,
    is_protected: protect,
    pin: pin,
    playlist_host: '',
    playlist_username: '',
    playlist_password: ''
  };
  
  const response = await makeRequest('POST', '/playlistw', tokens, payload, session.token);
  
  return response;
}

async function deletePlaylist(session, playlistId, pin = '') {
  const tokens = await generateAllTokens(session.macAddress, session.password);
  
  // DELETE em /playlistw com body contendo mac_address e playlist_id
  const data = {
    mac_address: session.macAddress,
    playlist_id: playlistId
  };
  
  const response = await makeRequest('DELETE', '/playlistw', tokens, data, session.token);
  
  return response;
}

module.exports = {
  login,
  listPlaylists,
  addPlaylist,
  editPlaylist,
  deletePlaylist,
  generateAllTokens
};