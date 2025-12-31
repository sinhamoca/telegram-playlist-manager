// services/imageScanner.js - Serviço de OCR para extrair MAC e Device Key de imagens
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const OCR_API_KEY = process.env.OCR_API_KEY || process.env.TWOCAPTCHA_API_KEY || '';
const OCR_API_URL = 'https://api.ocr.space/parse/image';

/**
 * Extrair MAC Address e Device Key de uma imagem
 * @param {string} imagePath - Caminho da imagem ou URL
 * @returns {Promise<{mac: string|null, key: string|null, raw: string}>}
 */
async function scanImage(imagePath) {
  try {
    console.log('🔍 ImageScanner: Iniciando OCR...');
    console.log(`📁 Imagem: ${imagePath}`);
    
    // Fazer OCR da imagem
    const ocrResult = await performOCR(imagePath);
    
    if (!ocrResult || !ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) {
      console.log('❌ OCR não retornou resultados');
      return { mac: null, key: null, raw: '', error: 'OCR falhou' };
    }
    
    const rawText = ocrResult.ParsedResults[0].ParsedText || '';
    console.log('📄 Texto extraído:', rawText);
    
    // Extrair MAC e Key do texto
    const extracted = extractCredentials(rawText);
    
    console.log('✅ Resultado:', extracted);
    
    return {
      mac: extracted.mac,
      key: extracted.key,
      raw: rawText,
      error: null
    };
    
  } catch (error) {
    console.error('❌ Erro no ImageScanner:', error.message);
    return { mac: null, key: null, raw: '', error: error.message };
  }
}

/**
 * Realizar OCR usando OCR.space API
 * @param {string} imagePath - Caminho local ou URL da imagem
 */
async function performOCR(imagePath) {
  if (!OCR_API_KEY) {
    throw new Error('OCR_API_KEY não configurada no .env');
  }
  
  const formData = new FormData();
  formData.append('apikey', OCR_API_KEY);
  formData.append('language', 'por'); // Português
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2'); // Engine 2 é melhor para fotos
  
  // Verificar se é URL ou arquivo local
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    formData.append('url', imagePath);
  } else {
    // Arquivo local
    if (!fs.existsSync(imagePath)) {
      throw new Error('Arquivo de imagem não encontrado');
    }
    formData.append('file', fs.createReadStream(imagePath));
  }
  
  const response = await axios.post(OCR_API_URL, formData, {
    headers: {
      ...formData.getHeaders()
    },
    timeout: 30000 // 30 segundos
  });
  
  if (response.data.IsErroredOnProcessing) {
    throw new Error(response.data.ErrorMessage || 'Erro no processamento OCR');
  }
  
  return response.data;
}

/**
 * Extrair MAC Address e Device Key do texto OCR
 * @param {string} text - Texto extraído pelo OCR
 * @returns {{mac: string|null, key: string|null}}
 */
function extractCredentials(text) {
  // Normalizar texto (remover quebras de linha extras, espaços múltiplos)
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '\n')
    .toLowerCase();
  
  console.log('🔍 Texto normalizado:', normalizedText);
  
  // ========== EXTRAIR MAC ADDRESS ==========
  // Padrão: XX:XX:XX:XX:XX:XX (alfanumérico, não apenas hex)
  // Pode ter letras de a-z e números 0-9
  const macRegex = /\b([a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2})\b/gi;
  
  const macMatches = normalizedText.match(macRegex);
  let mac = null;
  
  if (macMatches && macMatches.length > 0) {
    // Pegar o primeiro MAC encontrado (geralmente é o correto)
    mac = macMatches[0].toLowerCase();
    console.log(`📱 MAC encontrado: ${mac}`);
    
    if (macMatches.length > 1) {
      console.log(`⚠️ Múltiplos MACs encontrados: ${macMatches.join(', ')}`);
    }
  }
  
  // ========== EXTRAIR DEVICE KEY ==========
  // Padrão: 6 dígitos numéricos
  // Evitar pegar números que fazem parte de outras coisas (preços, datas, etc.)
  const keyRegex = /\b(\d{6})\b/g;
  
  const keyMatches = normalizedText.match(keyRegex);
  let key = null;
  
  if (keyMatches && keyMatches.length > 0) {
    // Filtrar números que provavelmente são Device Key
    // (não são preços como 9.99, não são anos, etc.)
    const validKeys = keyMatches.filter(k => {
      // Excluir se parece ser preço (próximo de € ou $)
      const priceCheck = new RegExp(`[€$]\\s*${k}|${k}\\s*[€$]`);
      if (priceCheck.test(normalizedText)) return false;
      
      // Excluir se parece ser ano (19XX ou 20XX no início)
      if (k.startsWith('19') || k.startsWith('20')) {
        // Verificar se está em contexto de data
        const dateCheck = new RegExp(`\\b${k}\\b.*(?:ano|year|date)`);
        if (dateCheck.test(normalizedText)) return false;
      }
      
      return true;
    });
    
    if (validKeys.length > 0) {
      key = validKeys[0];
      console.log(`🔑 Key encontrada: ${key}`);
      
      if (validKeys.length > 1) {
        console.log(`⚠️ Múltiplas Keys encontradas: ${validKeys.join(', ')}`);
      }
    }
  }
  
  // Se não encontrou com regex padrão, tentar padrões alternativos
  if (!mac) {
    // Tentar com hífen em vez de dois pontos
    const macHyphenRegex = /\b([a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2})\b/gi;
    const macHyphenMatches = normalizedText.match(macHyphenRegex);
    if (macHyphenMatches && macHyphenMatches.length > 0) {
      // Converter hífen para dois pontos
      mac = macHyphenMatches[0].replace(/-/g, ':').toLowerCase();
      console.log(`📱 MAC encontrado (formato hífen): ${mac}`);
    }
  }
  
  // Tentar encontrar key próxima a palavras-chave
  if (!key) {
    const keyContextRegex = /(?:key|chave|dispositivo|device)[\s:]*(\d{6})/gi;
    const keyContextMatch = keyContextRegex.exec(normalizedText);
    if (keyContextMatch) {
      key = keyContextMatch[1];
      console.log(`🔑 Key encontrada (por contexto): ${key}`);
    }
  }
  
  return { mac, key };
}

/**
 * Validar formato do MAC Address
 * @param {string} mac 
 * @returns {boolean}
 */
function isValidMac(mac) {
  if (!mac) return false;
  const macRegex = /^([a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2})$/i;
  return macRegex.test(mac);
}

/**
 * Validar formato do Device Key
 * @param {string} key 
 * @returns {boolean}
 */
function isValidKey(key) {
  if (!key) return false;
  return /^\d{6}$/.test(key);
}

/**
 * Baixar imagem do Telegram e salvar localmente
 * @param {object} ctx - Contexto do Telegraf
 * @param {string} fileId - ID do arquivo no Telegram
 * @returns {Promise<string>} - Caminho do arquivo salvo
 */
async function downloadTelegramImage(ctx, fileId) {
  const path = require('path');
  const downloadsDir = path.join(__dirname, '../downloads');
  
  // Criar diretório se não existir
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  
  // Obter link do arquivo
  const fileLink = await ctx.telegram.getFileLink(fileId);
  
  // Nome único para o arquivo
  const fileName = `scan_${Date.now()}.jpg`;
  const filePath = path.join(downloadsDir, fileName);
  
  // Baixar arquivo
  const response = await axios({
    method: 'GET',
    url: fileLink.href,
    responseType: 'stream'
  });
  
  // Salvar no disco
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      console.log(`📥 Imagem salva: ${filePath}`);
      resolve(filePath);
    });
    writer.on('error', reject);
  });
}

/**
 * Limpar imagem temporária
 * @param {string} filePath 
 */
function cleanupImage(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Imagem removida: ${filePath}`);
    }
  } catch (error) {
    console.error('Erro ao remover imagem:', error.message);
  }
}

module.exports = {
  scanImage,
  extractCredentials,
  isValidMac,
  isValidKey,
  downloadTelegramImage,
  cleanupImage
};
