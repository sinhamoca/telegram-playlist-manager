// handlers/quickManage.js - Handler de gestão rápida
const db = require('../database/db');
const keyboards = require('../utils/keyboards');
const messages = require('../utils/messages');

// Estados da gestão rápida
const QUICK_MANAGE_STATES = {
  WAITING_MAC: 'waiting_mac',
  WAITING_KEY: 'waiting_key',
  WAITING_PLAYER: 'waiting_player',
  WAITING_DOMAIN: 'waiting_domain',
  WAITING_NAME: 'waiting_name',
  PROCESSING: 'processing'
};

// Iniciar gestão rápida
async function startQuickManage(ctx) {
  ctx.session.quickManage = {
    state: QUICK_MANAGE_STATES.WAITING_MAC
  };
  
  await ctx.reply(
    '⚡ *Gestão Rápida*\n\n' +
    'Vamos cadastrar e gerenciar um cliente rapidamente!\n\n' +
    'Por favor, envie o *MAC Address* do cliente:\n' +
    '_(Ex: 00:1A:79:XX:XX:XX)_',
    {
      parse_mode: 'Markdown',
      ...keyboards.cancelMenu()
    }
  );
}

// Processar mensagens da gestão rápida
async function handleQuickManageMessage(ctx) {
  const state = ctx.session.quickManage?.state;
  const text = ctx.message.text.trim();
  
  if (!state) return false;
  
  try {
    switch (state) {
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

// Handler: MAC Address
async function handleMacInput(ctx, mac) {
  // Validar formato MAC
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!macRegex.test(mac)) {
    await ctx.reply(
      '❌ MAC Address inválido!\n\n' +
      'Use o formato: 00:1A:79:XX:XX:XX\n' +
      'Tente novamente:'
    );
    return true;
  }
  
  // Verificar se já existe
  const existing = db.getClientByMac(mac);
  if (existing) {
    await ctx.reply(
      `⚠️ Este MAC já está cadastrado!\n\n` +
      `📱 Cliente: *${existing.name}*\n` +
      `🎮 Player: ${existing.player_type}\n\n` +
      `Deseja gerenciar este cliente?`,
      {
        parse_mode: 'Markdown',
        ...keyboards.clientMenu(existing.id, existing.name)
      }
    );
    delete ctx.session.quickManage;
    return true;
  }
  
  ctx.session.quickManage.mac = mac;
  ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_KEY;
  
  await ctx.reply(
    `✅ MAC recebido: \`${mac}\`\n\n` +
    'Agora envie o *Device Key* (ou Password para IBOPro):',
    { parse_mode: 'Markdown' }
  );
  
  return true;
}

// Handler: Device Key
async function handleKeyInput(ctx, key) {
  ctx.session.quickManage.key = key;
  ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_PLAYER;
  
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
  ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_NAME;
  
  await ctx.reply(
    `✅ Domínio recebido: ${domain}\n\n` +
    'Por último, qual o *nome do cliente*?\n' +
    '_(Este nome será usado para identificar o cliente)_',
    { parse_mode: 'Markdown' }
  );
  
  return true;
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
      domain: data.domain || null
    });
    
    // Buscar cliente criado
    const client = db.getClientById(clientId);
    
    await ctx.reply(
      messages.successMessage(`Cliente "${name}" cadastrado!`) + '\n\n' +
      '🔐 Fazendo login...'
    );
    
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
    ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_NAME;
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `📱 ${player === 'ibopro' ? 'IBOPro' : 'VU Player'} selecionado!\n\n` +
      'Qual o *nome do cliente*?\n' +
      '_(Este nome será usado para identificar o cliente)_',
      { parse_mode: 'Markdown' }
    );
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
      ctx.session.quickManage.state = QUICK_MANAGE_STATES.WAITING_NAME;
      
      await ctx.editMessageText(
        `✅ Domínio selecionado: \`${domain.domain}\`\n\n` +
        'Qual o *nome do cliente*?\n' +
        '_(Este nome será usado para identificar o cliente)_',
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Erro ao selecionar domínio:', error);
    await ctx.reply('❌ Erro ao selecionar domínio');
  }
}

module.exports = {
  startQuickManage,
  handleQuickManageMessage,
  handlePlayerSelection,
  handleDomainSelection,
  QUICK_MANAGE_STATES
};