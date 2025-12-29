// services/iboplayer.js - Usando 2Captcha + Sharp (como CLI v2 funcional)
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY || '';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== CAPTCHA COM SHARP (COPIADO DO CLI V2) ==========

function cleanSvg(svgContent) {
  let cleanedSvg = svgContent;
  cleanedSvg = cleanedSvg.replace(/(<svg[^>]*width="[^"]*"[^>]*)(width="[^"]*")/gi, '$1');
  cleanedSvg = cleanedSvg.replace(/(<svg[^>]*height="[^"]*"[^>]*)(height="[^"]*")/gi, '$1');
  return cleanedSvg;
}

async function svgToPng(svgContent) {
  const cleanedSvg = cleanSvg(svgContent);
  const pngBuffer = await sharp(Buffer.from(cleanedSvg))
    .png()
    .toBuffer();
  return pngBuffer;
}

async function solveCaptcha(svgContent) {
  if (!TWOCAPTCHA_API_KEY || TWOCAPTCHA_API_KEY === 'sua-api-key-2captcha') {
    throw new Error('2Captcha API key não configurada. Configure TWOCAPTCHA_API_KEY no .env');
  }
  
  console.log('🔄 Resolvendo captcha com 2Captcha...');
  
  const pngBuffer = await svgToPng(svgContent);
  const pngBase64 = pngBuffer.toString('base64');
  
  console.log(`📤 Enviando captcha (${Math.round(pngBase64.length / 1024)}KB)...`);
  
  const formData = new FormData();
  formData.append('key', TWOCAPTCHA_API_KEY);
  formData.append('method', 'base64');
  formData.append('body', pngBase64);
  formData.append('numeric', '2');
  formData.append('min_len', '2');
  formData.append('max_len', '2');
  formData.append('json', '1');
  
  const submitResponse = await axios.post('http://2captcha.com/in.php', formData, {
    headers: formData.getHeaders()
  });
  
  if (submitResponse.data.status !== 1) {
    throw new Error(`Erro ao enviar captcha: ${submitResponse.data.request}`);
  }
  
  const captchaId = submitResponse.data.request;
  console.log(`✅ Captcha enviado! ID: ${captchaId}`);
  
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    await sleep(3000);
    
    const resultResponse = await axios.get('http://2captcha.com/res.php', {
      params: {
        key: TWOCAPTCHA_API_KEY,
        action: 'get',
        id: captchaId,
        json: 1
      }
    });
    
    if (resultResponse.data.status === 1) {
      const solution = resultResponse.data.request;
      console.log(`✅ 2Captcha resolveu: ${solution}`);
      return solution;
    }
    
    if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`Erro na resolução: ${resultResponse.data.request}`);
    }
    
    attempts++;
    console.log(`⏳ Aguardando... (${attempts}/${maxAttempts})`);
  }
  
  throw new Error('Timeout ao resolver captcha');
}

// ========== AUTENTICAÇÃO ==========

async function getCaptcha(domain) {
  const response = await axios.get(`https://${domain}/frontend/captcha/generate`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': `https://${domain}/frontend/device/login`
    }
  });
  
  return response.data;
}

async function login(client) {
  // Limpar domain removendo http:// ou https://
  let domain = client.domain || client.mac_address.split(':').join('').toLowerCase() + '.example.com';
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  const macAddress = client.mac_address;
  const deviceKey = client.device_key;
  
  console.log(`🔐 IBOPlayer: Fazendo login (${domain})...`);
  
  // Tentar até 3 vezes em caso de captcha incorreto
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`📥 Obtendo captcha (tentativa ${attempt}/${maxAttempts})...`);
      const captchaData = await getCaptcha(domain);
      const token = captchaData.token;
      
      if (!captchaData.svg || !token) {
        throw new Error('Captcha ou token não encontrado');
      }
      
      console.log('✅ Captcha obtido!');
      
      const captchaSolution = await solveCaptcha(captchaData.svg);
      
      console.log('🔓 Fazendo login...');
      const response = await axios.post(
        `https://${domain}/frontend/device/login`,
        {
          mac_address: macAddress,
          device_key: deviceKey,
          captcha: captchaSolution,
          token: token
        },
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': `https://${domain}`,
            'Referer': `https://${domain}/frontend/device/login`
          }
        }
      );
      
      // Verificar se o login foi bem-sucedido
      if (response.data.status === 'success') {
        const cookies = response.headers['set-cookie'] || [];
        
        console.log(`✅ IBOPlayer: Login bem-sucedido!`);
        
        return {
          domain,
          macAddress,
          deviceKey,
          deviceId: response.data.device._id,
          cookies: cookies,
          loginTime: new Date().toISOString(),
          device: response.data.device
        };
      }
      
      // Tratar erro de device key incorreto
      if (response.data.status === 'fail' && response.data.message && 
          response.data.message.includes('device information is incorrect')) {
        console.error('❌ MAC Address ou Device Key incorretos!');
        throw new Error(
          'MAC Address ou Device Key incorretos. ' +
          'Verifique as informações do dispositivo no aplicativo IBOPlayer e atualize o cadastro do cliente.'
        );
      }
      
      // Tratar erro de captcha incorreto ou expirado
      if (response.data.message === 'Captcha is incorrect or expired') {
        console.warn(`⚠️  Captcha incorreto (tentativa ${attempt}/${maxAttempts}). Tentando novamente...`);
        
        if (attempt < maxAttempts) {
          await sleep(2000); // Aguardar 2s antes de tentar novamente
          continue; // Tentar novamente
        } else {
          throw new Error(
            'Falha após 3 tentativas: 2Captcha está retornando respostas incorretas. ' +
            'Aguarde alguns minutos e tente novamente.'
          );
        }
      }
      
      // Outros erros
      throw new Error('Login falhou: ' + (response.data.message || JSON.stringify(response.data)));
      
    } catch (error) {
      // Se for erro de axios (HTTP), verificar se é 400 com mensagem específica
      if (error.response?.status === 400 && error.response?.data?.message) {
        const errorMsg = error.response.data.message;
        
        // Erro de device key/MAC incorretos
        if (errorMsg.includes('device information is incorrect')) {
          console.error('❌ MAC Address ou Device Key incorretos!');
          throw new Error(
            'MAC Address ou Device Key incorretos. ' +
            'Verifique as informações do dispositivo no aplicativo IBOPlayer e atualize o cadastro do cliente.'
          );
        }
        
        // Erro de captcha incorreto
        if (errorMsg === 'Captcha is incorrect or expired') {
          console.warn(`⚠️  Captcha incorreto (tentativa ${attempt}/${maxAttempts}). Tentando novamente...`);
          
          if (attempt < maxAttempts) {
            await sleep(2000);
            continue;
          } else {
            throw new Error(
              'Falha após 3 tentativas: 2Captcha está retornando respostas incorretas. ' +
              'Aguarde alguns minutos e tente novamente.'
            );
          }
        }
      }
      
      // Se for um erro já conhecido (device key incorreto), repassar
      if (error.message.includes('MAC Address ou Device Key incorretos')) {
        throw error;
      }
      
      // Se é a última tentativa ou erro não relacionado a captcha, lançar erro
      if (attempt >= maxAttempts || !error.message.includes('Captcha')) {
        throw error;
      }
      
      // Aguardar antes de tentar novamente
      console.warn(`⚠️  Erro na tentativa ${attempt}/${maxAttempts}: ${error.message}`);
      await sleep(2000);
    }
  }
  
  throw new Error('Falha após todas as tentativas de login');
}

// ========== PLAYLISTS ==========

async function listPlaylists(session) {
  const response = await axios.get(
    `https://${session.domain}/frontend/device/playlists`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': `https://${session.domain}/dashboard`,
        'Cookie': session.cookies.join('; ')
      }
    }
  );
  
  if (response.data.status !== 'Sucess') {
    throw new Error('Erro ao listar playlists');
  }
  
  const playlists = response.data.playlists.map(p => ({
    id: p._id || p.id,
    name: p.playlist_name || p.name || 'Sem nome',
    url: p.playlist_url || p.url || '',
    type: p.playlist_type || p.type || 'general',
    is_protected: p.protect === 1 || p.protect === '1',
    pin: p.pin || ''
  }));
  
  return playlists;
}

async function addPlaylist(session, options) {
  const { name, url, pin = '', protect = false, type = 'general' } = options;
  
  const payload = {
    current_playlist_url_id: -1,
    password: '',
    pin: pin,
    playlist_name: name,
    playlist_type: type,
    playlist_url: url,
    protect: protect ? 1 : 0,
    username: '',
    xml_url: ''
  };
  
  const response = await axios.post(
    `https://${session.domain}/frontend/device/savePlaylist`,
    payload,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': `https://${session.domain}`,
        'Referer': `https://${session.domain}/dashboard`,
        'Cookie': session.cookies.join('; ')
      }
    }
  );
  
  if (response.data.status !== 'success') {
    throw new Error('Erro ao adicionar playlist');
  }
  
  return response.data.data;
}

async function editPlaylist(session, playlistId, options) {
  const { name, url, pin = '', protect = false, type = 'general' } = options;
  
  const payload = {
    current_playlist_url_id: playlistId,
    password: '',
    pin: pin,
    playlist_name: name,
    playlist_type: type,
    playlist_url: url,
    protect: protect ? 1 : 0,
    username: '',
    xml_url: ''
  };
  
  const response = await axios.post(
    `https://${session.domain}/frontend/device/savePlaylist`,
    payload,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': `https://${session.domain}`,
        'Referer': `https://${session.domain}/dashboard`,
        'Cookie': session.cookies.join('; ')
      }
    }
  );
  
  if (response.data.status !== 'success') {
    throw new Error('Erro ao editar playlist');
  }
  
  return response.data.data;
}

async function deletePlaylist(session, playlistId) {
  const response = await axios.delete(
    `https://${session.domain}/frontend/device/deletePlayListUrl/${playlistId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': `https://${session.domain}/dashboard`,
        'Cookie': session.cookies.join('; ')
      }
    }
  );
  
  if (response.data.status !== 'success') {
    throw new Error('Erro ao deletar playlist');
  }
  
  return response.data;
}

module.exports = {
  login,
  listPlaylists,
  addPlaylist,
  editPlaylist,
  deletePlaylist
};