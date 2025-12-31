// services/vuplayer.js - Integração com VU Player
const axios = require('axios');
const { URLSearchParams } = require('url');

const DOMAIN = process.env.VUPLAYER_DOMAIN || 'vuproplayer.org';
const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

// ========== LOGIN ==========

async function login(client) {
  const { mac_address, device_key } = client;
  
  console.log('🔐 VUPlayer: Iniciando login...');
  console.log(`📍 Domain: ${DOMAIN}`);
  console.log(`☁️ Worker: ${CLOUDFLARE_WORKER_URL}`);
  console.log(`📝 MAC: ${mac_address}`);
  console.log(`🔑 Device Key: ${device_key.substring(0, 10)}...`);
  
  const params = new URLSearchParams({
    mac_address: mac_address,
    device_key: device_key,
    submit: ''
  });
  
  const postData = params.toString();
  console.log(`📤 Payload: ${postData}`);
  
  const requestPayload = {
    url: `https://${DOMAIN}/login`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Referer': `https://${DOMAIN}/login`,
      'Origin': `https://${DOMAIN}`
    },
    body: postData
  };
  
  console.log('🌐 Request completo:', JSON.stringify(requestPayload, null, 2));
  
  try {
    const response = await axios.post(CLOUDFLARE_WORKER_URL, requestPayload);
    
    const workerData = response.data;
    const statusCode = workerData.status;
    
    console.log(`📥 Status Code: ${statusCode}`);
    console.log(`📋 Headers:`, JSON.stringify(workerData.headers, null, 2));
    console.log(`📄 Body preview:`, workerData.body?.substring(0, 300));
    
    const setCookieHeader = workerData.headers['set-cookie'];
    let cookies = [];
    
    if (Array.isArray(setCookieHeader)) {
      cookies = setCookieHeader;
    } else if (typeof setCookieHeader === 'string') {
      cookies = [setCookieHeader];
    }
    
    console.log('🔐 VUPlayer Login - Status:', statusCode);
    console.log('🍪 VUPlayer Login - Cookies recebidos:', cookies.length);
    if (cookies.length > 0) {
      cookies.forEach((cookie, i) => {
        console.log(`   Cookie ${i + 1}: ${cookie.substring(0, 50)}...`);
      });
    }
    
    // Verificar sucesso (302 redirect com cookie OU 200 com cookie) - IGUAL CLI
    if ((statusCode === 302 || statusCode === 200) && cookies.length > 0) {
      const cookie = cookies[0].split(';')[0]; // Pegar só o primeiro como no CLI
      
      console.log('✅ VUPlayer Login - Cookie recebido!');
      console.log('🔍 Testando acesso a /mylist com o cookie...');
      
      // IMPORTANTE: Fazer request manual para /mylist para verificar se o login funcionou
      try {
        const testResponse = await axios.post(CLOUDFLARE_WORKER_URL, {
          url: `https://${DOMAIN}/mylist`,
          method: 'GET',
          headers: {
            'Cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            'Referer': `https://${DOMAIN}/login`
          }
        });
        
        const mylistHtml = testResponse.data.body;
        
        // Verificar se conseguiu acessar /mylist (página autenticada tem "Mac Address :")
        if (typeof mylistHtml === 'string' && mylistHtml.includes('Mac Address :')) {
          console.log('✅ Cookie válido - /mylist acessível!');
          const macMatch = mylistHtml.match(/Mac Address\s*:\s*([0-9a-fA-F:]+)/);
          if (macMatch) {
            console.log(`📱 MAC verificado: ${macMatch[1]}`);
          }
        } else {
          console.log('❌ Cookie inválido - /mylist não acessível');
          console.log('📄 Response preview:', mylistHtml?.substring(0, 200));
          throw new Error('Login falhou - credenciais inválidas. Cookie não dá acesso a /mylist');
        }
      } catch (testError) {
        console.error('❌ Erro ao testar /mylist:', testError.message);
        throw new Error('Login falhou - não foi possível acessar /mylist com o cookie recebido');
      }
      
      return {
        macAddress: mac_address,
        deviceKey: device_key,
        cookie: cookie,
        loginTime: new Date().toISOString()
      };
    } else {
      console.log('❌ VUPlayer Login - Falhou. Status:', statusCode, 'Cookies:', cookies.length);
      throw new Error('Login falhou - credenciais inválidas ou servidor indisponível');
    }
  } catch (error) {
    throw new Error(`Erro ao fazer login: ${error.message}`);
  }
}

// ========== REQUISIÇÕES ==========

async function makeRequest(method, path, cookie, data = null) {
  const headers = {
    'Cookie': cookie,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36',
    'Accept': method === 'GET' ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Referer': `https://${DOMAIN}/mylist`
  };

  if (data) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Origin'] = `https://${DOMAIN}`;
  }

  const response = await axios.post(CLOUDFLARE_WORKER_URL, {
    url: `https://${DOMAIN}${path}`,
    method: method,
    headers: headers,
    body: data ? data.toString() : undefined
  });
  
  const workerData = response.data;
  
  if (workerData.status === 200) {
    return workerData.body;
  } else {
    throw new Error(`Erro HTTP ${workerData.status}`);
  }
}

// ========== PARSER HTML ==========

function parsePlaylistsHTML(html) {
  const playlists = [];
  
  console.log('🔍 VUPlayer Parser - Analisando HTML...');
  
  // Detectar se é página de login (não autenticado) vs página /mylist (autenticado)
  const isLoginPage = html.includes('<h1><span>Manage</span> Your playlist</h1>') && 
                      html.includes('activate device and manage playlists');
  
  const isMylistPage = html.includes('Mac Address :') && 
                       html.includes('Device Key :') &&
                       html.includes('Expiry date :');
  
  console.log('📄 Tipo de página:', {
    isLoginPage,
    isMylistPage,
    hasManageTitle: html.includes('Manage'),
    hasMacAddress: html.includes('Mac Address'),
    htmlLength: html.length
  });
  
  if (isLoginPage && !isMylistPage) {
    console.log('⚠️ Página é a tela de GERENCIAMENTO mas sem dados do device (não autenticado)');
    console.log('🔍 Procurando mensagem de erro ou form de login...');
    
    // Verificar se tem mensagem de erro
    if (html.includes('Invalid') || html.includes('incorrect')) {
      console.log('❌ Credenciais inválidas detectadas no HTML');
    }
    
    throw new Error('Sessão inválida - página de gerenciamento sem autenticação');
  }
  
  if (!isMylistPage) {
    console.log('❌ Página não é /mylist autenticado');
    console.log('📄 HTML preview:', html.substring(0, 500));
    throw new Error('Página inesperada - não é /mylist');
  }
  
  console.log('✅ Página /mylist autenticada detectada!');
  
  // Extrair informações do device para confirmar
  const macMatch = html.match(/Mac Address\s*:\s*([0-9a-fA-F:]+)/);
  const keyMatch = html.match(/Device Key\s*:\s*(\d+)/);
  
  if (macMatch && keyMatch) {
    console.log('📱 Device info:', {
      mac: macMatch[1],
      key: keyMatch[1]
    });
  }
  
  // Procurar tbody da tabela de playlists
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  
  if (!tbodyMatch) {
    console.log('⚠️ <tbody> não encontrado - pode não ter playlists ou HTML mudou');
    console.log('🔍 Procurando playlists fora do tbody...');
    
    // Tentar pegar do HTML completo
    const tableMatch = html.match(/<table[^>]*class="table"[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      console.log('✅ Tabela encontrada, mas sem playlists no tbody');
      return playlists; // Retornar vazio mas sem erro
    }
    
    return playlists;
  }
  
  console.log('✅ <tbody> encontrado!');
  const tbody = tbodyMatch[1];
  console.log('📄 tbody length:', tbody.length);
  
  // Regex robusto para linhas da tabela
  // Formato: <tr><td class="text-center">NOME</td><td class="text-center">URL</td><td class="text-center">...buttons com data-current_id...</td></tr>
  const rowRegex = /<tr[^>]*>\s*<td[^>]*class="text-center"[^>]*>([^<]+)<\/td>\s*<td[^>]*class="text-center"[^>]*>(.*?)<\/td>\s*<td[^>]*class="text-center"[^>]*>[\s\S]*?data-current_id="([^"]+)"[\s\S]*?data-protected="([^"]+)"(?:[\s\S]*?data-playlist_type="([^"]*)")?/gi;
  
  let match;
  let rowCount = 0;
  
  while ((match = rowRegex.exec(tbody)) !== null) {
    rowCount++;
    
    // Decodificar HTML entities (&amp; -> &)
    const url = match[2]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    
    const playlist = {
      name: match[1].trim(),
      url: url,
      id: match[3].trim(),
      is_protected: match[4] === '1',
      type: match[5] ? match[5].trim() : 'general'
    };
    
    console.log(`✅ Row ${rowCount}:`, playlist);
    playlists.push(playlist);
  }
  
  console.log(`✅ VUPlayer Parser - Total: ${playlists.length} playlist(s) parseadas`);
  
  return playlists;
}

// ========== PLAYLISTS ==========

async function listPlaylists(session) {
  console.log('🔍 VUPlayer listPlaylists - Session:', {
    macAddress: session.macAddress,
    hasCookie: !!session.cookie
  });
  
  const html = await makeRequest('GET', '/mylist', session.cookie);
  
  console.log('📥 VUPlayer listPlaylists - HTML length:', html.length);
  console.log('📄 VUPlayer listPlaylists - HTML preview:', html.substring(0, 500));
  
  const playlists = parsePlaylistsHTML(html);
  
  console.log(`✅ VUPlayer: ${playlists.length} playlist(s) encontrada(s)`);
  
  return playlists;
}

async function addPlaylist(session, options) {
  const { name, url, pin = '', protect = false, type = 'general' } = options;
  
  const params = new URLSearchParams({
    current_playlist_url_id: '-1',  // -1 indica nova playlist
    playlist_name: name,
    playlist_url: url,
    protect: protect ? '1' : '0',
    pin: protect ? pin : '',
    playlist_type: type,
    user_name: '',
    password: ''
  });

  const response = await makeRequest('POST', '/savePlaylist', session.cookie, params);
  
  try {
    const result = JSON.parse(response);
    if (result.status === 'success') {
      return result.data;
    } else {
      throw new Error(result.msg || 'Erro ao adicionar playlist');
    }
  } catch (error) {
    throw new Error('Erro ao processar resposta: ' + error.message);
  }
}

async function editPlaylist(session, playlistId, options) {
  const { name, url, pin = '', protect = false, type = 'general' } = options;
  
  console.log('✏️ VUPlayer editPlaylist:', { playlistId, name, url });
  
  const params = new URLSearchParams({
    current_playlist_url_id: playlistId,  // Campo correto!
    playlist_name: name,
    playlist_url: url,
    protect: protect ? '1' : '0',
    pin: protect ? pin : '',
    playlist_type: type,
    user_name: '',
    password: ''
  });

  console.log('📤 VUPlayer editPlaylist - Params:', params.toString());

  const response = await makeRequest('POST', '/savePlaylist', session.cookie, params);
  
  console.log('📥 VUPlayer editPlaylist - Response:', response);
  
  try {
    const result = JSON.parse(response);
    if (result.status === 'success') {
      return result.data;
    } else {
      throw new Error(result.msg || result.message || 'Erro ao editar playlist');
    }
  } catch (error) {
    throw new Error('Erro ao processar resposta: ' + error.message);
  }
}

async function deletePlaylist(session, playlistId) {
  console.log(`🗑️  VUPlayer deletePlaylist - ID: ${playlistId}`);
  
  const params = new URLSearchParams({
    playlist_url_id: playlistId
  });
  
  console.log(`📤 DELETE /deletePlayListUrl`);
  console.log(`📤 Params: ${params.toString()}`);
  console.log(`📤 Method: DELETE`);
  
  try {
    const response = await makeRequest('DELETE', '/deletePlayListUrl', session.cookie, params);
    
    console.log(`📥 DELETE response (raw): ${response.substring(0, 500)}`);
    
    const result = JSON.parse(response);
    console.log(`📋 DELETE parsed result:`, result);
    
    if (result.status === 'success') {
      console.log(`✅ Playlist deletada com sucesso!`);
      return result;
    } else {
      throw new Error(result.msg || result.message || result.error || 'Erro ao deletar playlist');
    }
  } catch (error) {
    console.error(`❌ Erro ao deletar:`, error.message);
    
    // Se for erro de parse, mostrar a resposta
    if (error.message.includes('Unexpected token')) {
      console.error(`📄 Resposta não é JSON válido`);
    }
    
    throw error;
  }
}

module.exports = {
  login,
  listPlaylists,
  addPlaylist,
  editPlaylist,
  deletePlaylist
};