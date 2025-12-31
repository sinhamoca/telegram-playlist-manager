// services/iboplayer.js - Usando OCR.space primeiro, depois 2Captcha como fallback
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

// OCR.space API key (mesma usada no imageScanner)
const OCR_API_KEY = process.env.OCR_API_KEY || process.env.OCR_SPACE_API_KEY || '';
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY || '';
const OCR_MAX_ATTEMPTS = parseInt(process.env.OCR_MAX_ATTEMPTS) || 10;

// Debug: mostrar se as keys estão configuradas
console.log(`🔧 IBOPlayer config: OCR_API_KEY=${OCR_API_KEY ? 'OK' : 'NÃO CONFIGURADA'}, 2CAPTCHA=${TWOCAPTCHA_API_KEY ? 'OK' : 'NÃO CONFIGURADA'}`);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== CAPTCHA COM OCR.SPACE (GRATUITO) ==========

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

/**
 * Tentar resolver captcha usando OCR.space (gratuito)
 * @param {string} svgContent - Conteúdo SVG do captcha
 * @returns {Promise<string|null>} - Solução ou null se falhar
 */
async function solveCaptchaWithOCR(svgContent) {
  if (!OCR_API_KEY) {
    console.log(`   ⚠️ OCR_API_KEY vazia`);
    return null;
  }
  
  try {
    const pngBuffer = await svgToPng(svgContent);
    const pngBase64 = pngBuffer.toString('base64');
    
    const formData = new FormData();
    formData.append('apikey', OCR_API_KEY);
    formData.append('base64Image', `data:image/png;base64,${pngBase64}`);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'false');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');
    formData.append('filetype', 'PNG');
    
    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: formData.getHeaders(),
      timeout: 15000
    });
    
    if (response.data.IsErroredOnProcessing) {
      console.log(`   ⚠️ OCR.space erro: ${response.data.ErrorMessage}`);
      return null;
    }
    
    if (!response.data.ParsedResults?.length) {
      console.log(`   ⚠️ OCR.space sem resultados`);
      return null;
    }
    
    const rawText = response.data.ParsedResults[0].ParsedText || '';
    const numbers = rawText.replace(/[^0-9]/g, '');
    
    console.log(`   📄 OCR.space leu: "${rawText.trim()}" → números: "${numbers}"`);
    
    if (numbers.length >= 2) {
      return numbers.substring(0, 2);
    }
    
    return null;
    
  } catch (error) {
    console.log(`   ⚠️ OCR.space erro: ${error.message}`);
    return null;
  }
}

/**
 * Resolver captcha usando 2Captcha (pago, mais preciso)
 * @param {string} svgContent - Conteúdo SVG do captcha
 * @returns {Promise<string>} - Solução do captcha
 */
async function solveCaptchaWith2Captcha(svgContent) {
  if (!TWOCAPTCHA_API_KEY || TWOCAPTCHA_API_KEY === 'sua-api-key-2captcha') {
    throw new Error('2Captcha API key não configurada');
  }
  
  const pngBuffer = await svgToPng(svgContent);
  const pngBase64 = pngBuffer.toString('base64');
  
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
    throw new Error(`2Captcha erro: ${submitResponse.data.request}`);
  }
  
  const captchaId = submitResponse.data.request;
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
      return resultResponse.data.request;
    }
    
    if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha erro: ${resultResponse.data.request}`);
    }
    
    attempts++;
  }
  
  throw new Error('2Captcha timeout');
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
  
  console.log(`🔐 IBOPlayer login: ${domain}`);
  
  // Fase 1: Tentar com OCR.space (gratuito) - até OCR_MAX_ATTEMPTS vezes
  if (OCR_API_KEY) {
    console.log(`   📸 Tentando OCR.space (até ${OCR_MAX_ATTEMPTS}x)...`);
    
    for (let ocrAttempt = 1; ocrAttempt <= OCR_MAX_ATTEMPTS; ocrAttempt++) {
      try {
        const captchaData = await getCaptcha(domain);
        
        if (!captchaData.svg || !captchaData.token) {
          console.log(`   ⚠️ Captcha inválido, tentativa ${ocrAttempt}/${OCR_MAX_ATTEMPTS}`);
          continue;
        }
        
        const ocrSolution = await solveCaptchaWithOCR(captchaData.svg);
        
        if (!ocrSolution) {
          console.log(`   ⚠️ OCR falhou, tentativa ${ocrAttempt}/${OCR_MAX_ATTEMPTS}`);
          await sleep(500);
          continue;
        }
        
        console.log(`   📸 OCR.space → ${ocrSolution} (tentativa ${ocrAttempt})`);
        
        // Tentar login com solução do OCR
        const response = await axios.post(
          `https://${domain}/frontend/device/login`,
          {
            mac_address: macAddress,
            device_key: deviceKey,
            captcha: ocrSolution,
            token: captchaData.token
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
        
        if (response.data.status === 'success') {
          const cookies = response.headers['set-cookie'] || [];
          console.log(`✅ IBOPlayer login OK! (OCR.space)`);
          
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
        
        // Erro de credenciais - parar imediatamente
        if (response.data.message?.includes('device information is incorrect')) {
          throw new Error('MAC Address ou Device Key incorretos');
        }
        
        // Captcha incorreto - continuar tentando
        if (response.data.message === 'Captcha is incorrect or expired') {
          console.log(`   ⚠️ Captcha incorreto, tentativa ${ocrAttempt}/${OCR_MAX_ATTEMPTS}`);
          await sleep(500);
          continue;
        }
        
      } catch (error) {
        if (error.message.includes('MAC Address ou Device Key incorretos')) {
          throw error;
        }
        
        // Erro de credenciais via HTTP 400
        if (error.response?.data?.message?.includes('device information is incorrect')) {
          throw new Error('MAC Address ou Device Key incorretos');
        }
        
        console.log(`   ⚠️ Erro OCR tentativa ${ocrAttempt}: ${error.message}`);
        await sleep(500);
      }
    }
    
    console.log(`   📸 OCR.space esgotou ${OCR_MAX_ATTEMPTS} tentativas, usando 2Captcha...`);
  }
  
  // Fase 2: Fallback para 2Captcha (pago)
  const max2CaptchaAttempts = 3;
  
  for (let attempt = 1; attempt <= max2CaptchaAttempts; attempt++) {
    try {
      const captchaData = await getCaptcha(domain);
      
      if (!captchaData.svg || !captchaData.token) {
        throw new Error('Captcha ou token não encontrado');
      }
      
      console.log(`   📸 2Captcha (aguarde ~10s)... tentativa ${attempt}/${max2CaptchaAttempts}`);
      const captchaSolution = await solveCaptchaWith2Captcha(captchaData.svg);
      console.log(`   📸 2Captcha → ${captchaSolution}`);
      
      const response = await axios.post(
        `https://${domain}/frontend/device/login`,
        {
          mac_address: macAddress,
          device_key: deviceKey,
          captcha: captchaSolution,
          token: captchaData.token
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
      
      if (response.data.status === 'success') {
        const cookies = response.headers['set-cookie'] || [];
        console.log(`✅ IBOPlayer login OK! (2Captcha)`);
        
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
      
      if (response.data.message?.includes('device information is incorrect')) {
        throw new Error('MAC Address ou Device Key incorretos');
      }
      
      if (response.data.message === 'Captcha is incorrect or expired') {
        console.log(`   ⚠️ Captcha incorreto, tentativa ${attempt}/${max2CaptchaAttempts}`);
        await sleep(1000);
        continue;
      }
      
      throw new Error('Login falhou: ' + (response.data.message || JSON.stringify(response.data)));
      
    } catch (error) {
      if (error.message.includes('MAC Address ou Device Key incorretos')) {
        throw error;
      }
      
      if (error.response?.data?.message?.includes('device information is incorrect')) {
        throw new Error('MAC Address ou Device Key incorretos');
      }
      
      if (attempt >= max2CaptchaAttempts) {
        throw error;
      }
      
      await sleep(1000);
    }
  }
  
  throw new Error('Falha no login IBOPlayer');
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