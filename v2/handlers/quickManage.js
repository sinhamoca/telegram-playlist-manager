// handlers/quickManage.js - Handler de gestão rápida com suporte a OCR
const { Markup } = require('telegraf');
const db = require('../database/db');
const keyboards = require('../utils/keyboards');
const messages = require('../utils/messages');
const imageScanner = require('../services/imageScanner');

// Estados da gestão rápida
const QUICK_MANAGE_STATES = {
  WAITING_MAC_OR_PHOTO: 'waiting_mac_or_photo',
  WAITING_CONFIRM_SCAN: 'waiting_confirm_scan',
  WAITING_MAC: 'waiting_mac',
  WAITING_KEY: 'waiting_key',
  WAITING_PLAYER: 'waiting_player',
  WAITING_DOMAIN: 'waiting_domain',
  WAITING_SERVER: 'waiting_server',
  WAITING_NAME: 'waiting_name',
  PROCESSING: 'processing'
};

// Iniciar gestão rápida
async function startQuickManage(ctx) {
  // Responder callback se vier de botão inline
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  
  ctx.session = ctx.session || {};
  ctx.session.quickManage = {
    state: QUICK_MANAGE_STATES.WAITING_MAC_OR_PHOTO
  };
  
  const messageText = '⚡ *Gestão Rápida*\n\n' +
    'Vamos cadastrar e gerenciar um cliente rapidamente!\n\n' +
    '📸 *Envie uma FOTO* da tela do aplicativo\n' +
    '_(O sistema irá escanear MAC e Device Key automaticamente)_\n\n' +
    '✏️ Ou digite o *MAC Address* manualmente:\n' +
    '_(Ex: 00:1A:79:XX:XX:XX)_';
  
  const options = {
    parse_mode: 'Markdown',
    ...keyboards.cancelMenu()
  };
  
  // Se vier de callback, editar mensagem. Senão, enviar nova.
  if (ctx.callbackQuery) {
    await ctx.editMessageText(messageText, options);
  } else {
    await ctx.reply(messageText, options);
  }
}

// Processar mensagens da gestão rápida
async function handleQuickManageMessage(ctx) {
  const state = ctx.session.quickManage?.state;
  const text = ctx.message?.text?.trim();
  
  if (!state) return false;
  
  try {
    switch (state) {
      case QUICK_MANAGE_STATES.WAITING_MAC_OR_PHOTO:
        // Se for texto, tratar como MAC
        if (text) {
          return await handleMacInput(ctx, text);
        }
        return false;
        
      case QUICK_MANAGE_STATES.WAITING_MAC:
        return await handleMacInput(ctx, text);
        
      case QUICK_MANAGE_STATES.WAITING_KEY:
        return await handleKeyInput(ctx, text);
        
      case QUICK_MANAGE_STATES.WAITING_DOMAIN:
        return await handleDomainInput(ctx, text);
        
      case QUICK_MANAGE_STATES.WAITING_NAME:
        return await handleNameInput(ctx, text);
        
      default:
        return false;
    }
  } catch (error) {
    console.error('Erro no quickManage:', error);
    await ctx.reply(messages.errorMessage(error.message));
    delete ctx.session.quickManage;
    return true;
  }
}

// Handler: Foto recebida
async function handleQuickManagePhoto(ctx) {
  const state = ctx.session.quickManage?.state;
  
  if (state !== QUICK_MANAGE_STATES.WAITING_MAC_OR_PHOTO) {
    return false;
  }
  
  try {
    // Pegar a maior resolução disponível
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]; // Última é a maior
    
    await ctx.reply('🔍 *Escaneando imagem...*\n\nAguarde enquanto extraio as informações...', {
      parse_mode: 'Markdown'
    });
    
    // Baixar imagem
    const imagePath = await imageScanner.downloadTelegramImage(ctx, photo.file_id);
    
    // Escanear imagem
    const result = await imageScanner.scanImage(imagePath);
    
    // Limpar arquivo temporário
    imageScanner.cleanupImage(imagePath);
    
    // Verificar resultados
    if (result.error) {
      await ctx.reply(
        `❌ *Erro ao escanear imagem*\n\n${result.error}\n\n` +
        '📸 Tente enviar outra foto ou digite manualmente:',
        { parse_mode: 'Markdown' }
      );
      return true;
    }
    
    if (!result.mac && !result.key) {
      await ctx.reply(
        '❌ *Não foi possível encontrar MAC ou Device Key na imagem*\n\n' +
        '💡 *Dicas:*\n' +
        '• Certifique-se que a foto está nítida\n' +
        '• O MAC e Key devem estar visíveis\n' +
        '• Tente tirar a foto mais de perto\n\n' +
        '📸 Envie outra foto ou digite o MAC manualmente:',
        { parse_mode: 'Markdown' }
      );
      return true;
    }
    
    if (!result.mac) {
      await ctx.reply(
        '⚠️ *MAC Address não encontrado*\n\n' +
        `🔑 Key encontrada: \`${result.key}\`\n\n` +
        '📸 Envie outra foto ou digite o MAC manualmente:',
        { parse_mode: 'Markdown' }
      );
      return true;
    }
    
    if (!result.key) {
      await ctx.reply(
        '⚠️ *Device Key não encontrada*\n\n' +
        `📱 MAC encontrado: \`${result.mac}\`\n\n` +
        '📸 Envie outra foto ou digite o MAC manualmente:',
        { parse_mode: 'Markdown' }
      );
      return true;
    }
    
    // Ambos encontrados! Mostrar para confirmação
    ctx.session.quickManage.scannedMac = result.mac;
    ctx.session.quickManage.scannedKey = result.key;
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_CONFIRM_SCAN;
    
    await ctx.reply(
      '✅ *Dados encontrados!*\n\n' +
      `📱 *MAC:* \`${result.mac}\`\n` +
      `🔑 *Key:* \`${result.key}\`\n\n` +
      'Os dados estão corretos?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar', 'quick:confirm_scan')],
          [Markup.button.callback('✏️ Corrigir MAC', 'quick:correct_mac')],
          [Markup.button.callback('✏️ Corrigir Key', 'quick:correct_key')],
          [Markup.button.callback('📸 Enviar Outra Foto', 'quick:rescan')],
          [Markup.button.callback('🔙 Cancelar', 'cancel')]
        ])
      }
    );
    
    return true;
    
  } catch (error) {
    console.error('Erro ao processar foto:', error);
    await ctx.reply(
      '❌ *Erro ao processar imagem*\n\n' +
      `${error.message}\n\n` +
      '📸 Tente novamente ou digite o MAC manualmente:',
      { parse_mode: 'Markdown' }
    );
    return true;
  }
}

// Callback: Confirmar dados escaneados
async function handleConfirmScan(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const data = ctx.session.quickManage;
    if (!data || !data.scannedMac || !data.scannedKey) {
      await ctx.editMessageText('❌ Dados não encontrados. Tente novamente.');
      delete ctx.session.quickManage;
      return;
    }
    
    // Verificar se MAC já existe
    const existing = db.getClientByMac(data.scannedMac);
    if (existing) {
      await ctx.editMessageText(
        `⚠️ Este MAC já está cadastrado!\n\n` +
        `📱 Cliente: *${existing.name}*\n` +
        `🎮 Player: ${existing.player_type}\n` +
        (existing.server_name ? `🗂️ Servidor: ${existing.server_color} ${existing.server_name}\n` : '') +
        `\nDeseja gerenciar este cliente?`,
        {
          parse_mode: 'Markdown',
          ...keyboards.clientMenu(existing.id, existing.name)
        }
      );
      delete ctx.session.quickManage;
      return;
    }
    
    // Salvar dados e ir para seleção de player
    data.mac = data.scannedMac;
    data.key = data.scannedKey;
    data.state = QUICK_MANAGE_STATES.WAITING_PLAYER;
    
    await ctx.editMessageText(
      `✅ Dados confirmados!\n\n` +
      `📱 MAC: \`${data.mac}\`\n` +
      `🔑 Key: \`${data.key}\`\n\n` +
      'Qual aplicativo o cliente usa?',
      {
        parse_mode: 'Markdown',
        ...keyboards.playerSelectionMenu()
      }
    );
    
  } catch (error) {
    console.error('Erro ao confirmar scan:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Callback: Corrigir MAC
async function handleCorrectMac(ctx) {
  try {
    await ctx.answerCbQuery();
    
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_MAC;
    ctx.session.quickManage.correctingFromScan = true;
    
    await ctx.editMessageText(
      '✏️ *Corrigir MAC Address*\n\n' +
      `MAC atual: \`${ctx.session.quickManage.scannedMac}\`\n\n` +
      'Digite o MAC correto:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Voltar', 'quick:back_to_confirm')]
        ])
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Callback: Corrigir Key
async function handleCorrectKey(ctx) {
  try {
    await ctx.answerCbQuery();
    
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_KEY;
    ctx.session.quickManage.correctingFromScan = true;
    
    await ctx.editMessageText(
      '✏️ *Corrigir Device Key*\n\n' +
      `Key atual: \`${ctx.session.quickManage.scannedKey}\`\n\n` +
      'Digite a Key correta:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Voltar', 'quick:back_to_confirm')]
        ])
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Callback: Voltar para confirmação
async function handleBackToConfirm(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const data = ctx.session.quickManage;
    data.state = QUICK_MANAGE_STATES.WAITING_CONFIRM_SCAN;
    
    await ctx.editMessageText(
      '✅ *Dados encontrados!*\n\n' +
      `📱 *MAC:* \`${data.scannedMac}\`\n` +
      `🔑 *Key:* \`${data.scannedKey}\`\n\n` +
      'Os dados estão corretos?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar', 'quick:confirm_scan')],
          [Markup.button.callback('✏️ Corrigir MAC', 'quick:correct_mac')],
          [Markup.button.callback('✏️ Corrigir Key', 'quick:correct_key')],
          [Markup.button.callback('📸 Enviar Outra Foto', 'quick:rescan')],
          [Markup.button.callback('🔙 Cancelar', 'cancel')]
        ])
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Callback: Reescanear
async function handleRescan(ctx) {
  try {
    await ctx.answerCbQuery();
    
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_MAC_OR_PHOTO;
    delete ctx.session.quickManage.scannedMac;
    delete ctx.session.quickManage.scannedKey;
    
    await ctx.editMessageText(
      '📸 *Envie uma nova foto*\n\n' +
      'Ou digite o MAC Address manualmente:',
      {
        parse_mode: 'Markdown',
        ...keyboards.cancelMenu()
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Handler: MAC Address
async function handleMacInput(ctx, mac) {
  const data = ctx.session.quickManage;
  
  // Validar formato MAC (aceita qualquer alfanumérico, não só hex)
  const macRegex = /^([a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2}:[a-z0-9]{2})$/i;
  if (!macRegex.test(mac)) {
    await ctx.reply(
      '❌ MAC Address inválido!\n\n' +
      'Use o formato: XX:XX:XX:XX:XX:XX\n' +
      '_(6 blocos de 2 caracteres separados por :)_\n\n' +
      'Tente novamente:',
      { parse_mode: 'Markdown' }
    );
    return true;
  }
  
  // Se estava corrigindo do scan, atualizar o valor escaneado
  if (data.correctingFromScan) {
    data.scannedMac = mac.toLowerCase();
    delete data.correctingFromScan;
    data.state = QUICK_MANAGE_STATES.WAITING_CONFIRM_SCAN;
    
    await ctx.reply(
      '✅ *MAC atualizado!*\n\n' +
      `📱 *MAC:* \`${data.scannedMac}\`\n` +
      `🔑 *Key:* \`${data.scannedKey}\`\n\n` +
      'Os dados estão corretos?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar', 'quick:confirm_scan')],
          [Markup.button.callback('✏️ Corrigir MAC', 'quick:correct_mac')],
          [Markup.button.callback('✏️ Corrigir Key', 'quick:correct_key')],
          [Markup.button.callback('🔙 Cancelar', 'cancel')]
        ])
      }
    );
    return true;
  }
  
  // Verificar se já existe
  const existing = db.getClientByMac(mac);
  if (existing) {
    await ctx.reply(
      `⚠️ Este MAC já está cadastrado!\n\n` +
      `📱 Cliente: *${existing.name}*\n` +
      `🎮 Player: ${existing.player_type}\n` +
      (existing.server_name ? `🗂️ Servidor: ${existing.server_color} ${existing.server_name}\n` : '') +
      `\nDeseja gerenciar este cliente?`,
      {
        parse_mode: 'Markdown',
        ...keyboards.clientMenu(existing.id, existing.name)
      }
    );
    delete ctx.session.quickManage;
    return true;
  }
  
  data.mac = mac.toLowerCase();
  data.state = QUICK_MANAGE_STATES.WAITING_KEY;
  
  await ctx.reply(
    `✅ MAC recebido: \`${mac}\`\n\n` +
    'Agora envie o *Device Key* (ou Password para IBOPro):',
    { parse_mode: 'Markdown' }
  );
  
  return true;
}

// Handler: Device Key
async function handleKeyInput(ctx, key) {
  const data = ctx.session.quickManage;
  
  // Se estava corrigindo do scan, atualizar o valor escaneado
  if (data.correctingFromScan) {
    data.scannedKey = key;
    delete data.correctingFromScan;
    data.state = QUICK_MANAGE_STATES.WAITING_CONFIRM_SCAN;
    
    await ctx.reply(
      '✅ *Key atualizada!*\n\n' +
      `📱 *MAC:* \`${data.scannedMac}\`\n` +
      `🔑 *Key:* \`${data.scannedKey}\`\n\n` +
      'Os dados estão corretos?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar', 'quick:confirm_scan')],
          [Markup.button.callback('✏️ Corrigir MAC', 'quick:correct_mac')],
          [Markup.button.callback('✏️ Corrigir Key', 'quick:correct_key')],
          [Markup.button.callback('🔙 Cancelar', 'cancel')]
        ])
      }
    );
    return true;
  }
  
  data.key = key;
  data.state = QUICK_MANAGE_STATES.WAITING_PLAYER;
  
  await ctx.reply(
    `✅ Key recebido!\n\n` +
    'Qual aplicativo o cliente usa?',
    { ...keyboards.playerSelectionMenu() }
  );
  
  return true;
}

// Handler: Domínio (apenas IBOPlayer)
async function handleDomainInput(ctx, domain) {
  ctx.session.quickManage.domain = domain;
  
  // Agora perguntar sobre servidor (opcional)
  await askAboutServer(ctx);
  
  return true;
}

// Perguntar sobre servidor (opcional)
async function askAboutServer(ctx) {
  const servers = db.getAllServers();
  
  if (servers.length === 0) {
    // Sem servidores cadastrados, ir direto para nome
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_NAME;
    
    await ctx.reply(
      '📝 Por último, qual o *nome do cliente*?\n' +
      '_(Este nome será usado para identificar o cliente)_',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_SERVER;
  
  // Criar botões com servidores
  const buttons = servers.map(server => [
    Markup.button.callback(
      `${server.color} ${server.name}`,
      `quick:server:${server.id}`
    )
  ]);
  
  // Adicionar opção de pular
  buttons.push([Markup.button.callback('⏭️ Pular (Sem Servidor)', 'quick:server:none')]);
  buttons.push([Markup.button.callback('🔙 Cancelar', 'cancel')]);
  
  await ctx.reply(
    '🗂️ *Atribuir Servidor (opcional)*\n\n' +
    'Selecione um servidor para este cliente ou pule:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    }
  );
}

// Handler: Nome do cliente
async function handleNameInput(ctx, name) {
  const data = ctx.session.quickManage;
  
  await ctx.reply(messages.loadingMessage('Cadastrando e fazendo login'));
  
  try {
    // Criar cliente no banco
    const clientId = db.createClient({
      name: name,
      playerType: data.player,
      macAddress: data.mac,
      deviceKey: data.key,
      password: data.player === 'ibopro' ? data.key : null,
      domain: data.domain || null,
      serverId: data.serverId || null
    });
    
    // Buscar cliente criado
    const client = db.getClientById(clientId);
    
    let successText = messages.successMessage(`Cliente "${name}" cadastrado!`);
    if (client.server_name) {
      successText += `\n🗂️ Servidor: ${client.server_color} ${client.server_name}`;
    }
    successText += '\n\n🔐 Fazendo login...';
    
    await ctx.reply(successText, { parse_mode: 'Markdown' });
    
    // Fazer login e mostrar menu
    const { getPlayerService } = require('./clientManage');
    await getPlayerService(ctx, client);
    
    delete ctx.session.quickManage;
    
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    await ctx.reply(messages.errorMessage(`Erro: ${error.message}`));
    delete ctx.session.quickManage;
  }
  
  return true;
}

// Callback: Seleção de player
async function handlePlayerSelection(ctx, player) {
  ctx.session.quickManage.player = player;
  
  if (player === 'iboplayer') {
    // Buscar domínios cadastrados
    const domains = db.getAllDomains(true);
    
    if (domains.length > 0) {
      ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_DOMAIN;
      
      // Criar botões com domínios
      const buttons = domains.map(domain => [
        { text: domain.domain, callback_data: `quick:domain:${domain.id}` }
      ]);
      
      // Adicionar opção de digitar manualmente
      buttons.push([{ text: '✏️ Digitar Outro Domínio', callback_data: 'quick:domain:custom' }]);
      buttons.push([{ text: '🔙 Cancelar', callback_data: 'cancel' }]);
      
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `📱 IBOPlayer selecionado!\n\n` +
        'Selecione o *domínio* ou digite um novo:',
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        }
      );
    } else {
      // Sem domínios cadastrados, pedir manualmente
      ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_DOMAIN;
      
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `📱 IBOPlayer selecionado!\n\n` +
        'Qual o *domínio*?\n' +
        '_(Ex: painel.exemplo.com ou ibotvplayer.com)_\n\n' +
        '💡 *Dica:* Cadastre domínios em Configurações → Gerenciar Domínios',
        { parse_mode: 'Markdown' }
      );
    }
  } else {
    // IBOPro e VUPlayer não precisam de domínio
    await ctx.answerCbQuery();
    
    // Perguntar sobre servidor
    await ctx.editMessageText(
      `📱 ${player === 'ibopro' ? 'IBOPro' : 'VU Player'} selecionado!`,
      { parse_mode: 'Markdown' }
    );
    
    await askAboutServer(ctx);
  }
}

// Handler: Seleção de domínio (via botão)
async function handleDomainSelection(ctx, domainId) {
  try {
    await ctx.answerCbQuery();
    
    if (domainId === 'custom') {
      // Usuário quer digitar manualmente
      ctx.session.quickManage.customDomain = true;
      
      await ctx.editMessageText(
        `✏️ *Digitar Domínio Manualmente*\n\n` +
        'Digite o domínio:\n' +
        '_(Ex: painel.exemplo.com ou ibotvplayer.com)_',
        { parse_mode: 'Markdown' }
      );
    } else {
      // Buscar domínio selecionado
      const domain = db.getDomainById(parseInt(domainId));
      
      if (!domain) {
        await ctx.reply('❌ Domínio não encontrado');
        return;
      }
      
      ctx.session.quickManage.domain = domain.domain;
      
      await ctx.editMessageText(
        `✅ Domínio selecionado: \`${domain.domain}\``,
        { parse_mode: 'Markdown' }
      );
      
      // Perguntar sobre servidor
      await askAboutServer(ctx);
    }
  } catch (error) {
    console.error('Erro ao selecionar domínio:', error);
    await ctx.reply('❌ Erro ao selecionar domínio');
  }
}

// Handler: Seleção de servidor (via botão)
async function handleServerSelection(ctx, serverId) {
  try {
    await ctx.answerCbQuery();
    
    if (serverId === 'none') {
      ctx.session.quickManage.serverId = null;
      
      await ctx.editMessageText(
        '⏭️ Servidor pulado\n\n' +
        '📝 Qual o *nome do cliente*?\n' +
        '_(Este nome será usado para identificar o cliente)_',
        { parse_mode: 'Markdown' }
      );
    } else {
      const server = db.getServerById(parseInt(serverId));
      
      if (!server) {
        await ctx.reply('❌ Servidor não encontrado');
        return;
      }
      
      ctx.session.quickManage.serverId = server.id;
      
      await ctx.editMessageText(
        `✅ Servidor: ${server.color} ${server.name}\n\n` +
        '📝 Qual o *nome do cliente*?\n' +
        '_(Este nome será usado para identificar o cliente)_',
        { parse_mode: 'Markdown' }
      );
    }
    
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_NAME;
    
  } catch (error) {
    console.error('Erro ao selecionar servidor:', error);
    await ctx.reply('❌ Erro ao selecionar servidor');
  }
}

module.exports = {
  startQuickManage,
  handleQuickManageMessage,
  handleQuickManagePhoto,
  handlePlayerSelection,
  handleDomainSelection,
  handleServerSelection,
  handleConfirmScan,
  handleCorrectMac,
  handleCorrectKey,
  handleBackToConfirm,
  handleRescan,
  QUICK_MANAGE_STATES
};