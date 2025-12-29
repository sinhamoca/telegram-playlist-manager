// handlers/clientManage.js - Handler de gerenciamento de clientes
const { Markup } = require('telegraf');
const db = require('../database/db');
const sessionManager = require('../services/sessionManager');
const keyboards = require('../utils/keyboards');
const messages = require('../utils/messages');

// Escapar caracteres especiais do Markdown MarkdownV2
function escapeMarkdown(text) {
  if (!text) return text;
  // Caracteres especiais do MarkdownV2
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Obter serviço do player
async function getPlayerService(ctx, client) {
  try {
    const playerServices = {
      'iboplayer': require('../services/iboplayer'),
      'ibopro': require('../services/ibopro'),
      'vuplayer': require('../services/vuplayer')
    };
    
    const service = playerServices[client.player_type];
    if (!service) {
      throw new Error(`Player ${client.player_type} não suportado`);
    }
    
    // Obter sessão válida (usa cache se disponível)
    const session = await sessionManager.getValidSession(client, service.login);
    
    // Mostrar menu do cliente
    await showClientMenu(ctx, client, session);
    
    return { service, session };
    
  } catch (error) {
    console.error(`Erro ao obter serviço para ${client.name}:`, error);
    throw error;
  }
}

// Mostrar menu do cliente
async function showClientMenu(ctx, client, session = null) {
  const messageText = messages.clientDetailsMessage(client, session);
  
  if (ctx.callbackQuery) {
    await ctx.editMessageText(
      messageText,
      {
        parse_mode: 'Markdown',
        ...keyboards.clientMenu(client.id, client.name)
      }
    );
  } else {
    await ctx.reply(
      messageText,
      {
        parse_mode: 'Markdown',
        ...keyboards.clientMenu(client.id, client.name)
      }
    );
  }
}

// Listar playlists do cliente
async function listClientPlaylists(ctx, clientId, originalMessageId = null) {
  try {
    const client = db.getClientById(clientId);
    if (!client) {
      // Verificar se é callback ou mensagem
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('❌ Cliente não encontrado');
      } else {
        await ctx.reply('❌ Cliente não encontrado');
      }
      return;
    }
    
    // Só chamar answerCbQuery se for um callback
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    // Se for mensagem de texto, enviar nova mensagem. Se for callback, editar.
    const loadingMsg = messages.loadingMessage('Carregando playlists');
    let messageToEdit;
    
    if (ctx.callbackQuery) {
      // É callback, editar a mensagem do callback
      messageToEdit = ctx.callbackQuery.message.message_id;
      await ctx.editMessageText(loadingMsg);
    } else if (originalMessageId) {
      // Temos o ID da mensagem original, editar ela
      messageToEdit = originalMessageId;
      await ctx.telegram.editMessageText(ctx.chat.id, originalMessageId, undefined, loadingMsg);
    } else {
      // Nova mensagem
      const msg = await ctx.reply(loadingMsg);
      messageToEdit = msg.message_id;
    }
    
    const { service, session } = await getPlayerService(ctx, client);
    const playlists = await service.listPlaylists(session.sessionData);
    
    const messageText = messages.playlistsListMessage(client.name, playlists);
    
    // Editar a mensagem (sempre editamos agora)
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageToEdit,
      undefined,
      messageText,
      {
        parse_mode: 'Markdown',
        ...keyboards.playlistsMenu(clientId, playlists)
      }
    );
    
    // Salvar playlists e messageId na sessão para uso posterior
    ctx.session.currentPlaylists = {
      clientId,
      playlists,
      session,
      messageId: messageToEdit
    };
    
  } catch (error) {
    console.error('Erro ao listar playlists:', error);
    
    // Tentar editar ou enviar nova mensagem
    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(messages.errorMessage(`Erro: ${error.message}`));
      } else {
        await ctx.reply(messages.errorMessage(`Erro: ${error.message}`));
      }
    } catch (e) {
      console.error('Erro ao enviar mensagem de erro:', e);
    }
  }
}

// Ver detalhes de uma playlist
async function viewPlaylist(ctx, clientId, playlistId) {
  try {
    const client = db.getClientById(clientId);
    const cached = ctx.session.currentPlaylists;
    
    if (!cached || cached.clientId !== clientId) {
      await ctx.answerCbQuery('❌ Playlists não carregadas. Recarregue a lista.');
      return;
    }
    
    const playlist = cached.playlists.find(p => p.id === playlistId);
    if (!playlist) {
      await ctx.answerCbQuery('❌ Playlist não encontrada');
      return;
    }
    
    await ctx.answerCbQuery();
    
    const messageText = messages.playlistDetailsMessage(playlist, client.name);
    
    await ctx.editMessageText(
      messageText,
      {
        parse_mode: 'Markdown',
        ...keyboards.playlistActionsMenu(clientId, playlistId)
      }
    );
    
  } catch (error) {
    console.error('Erro ao ver playlist:', error);
    await ctx.answerCbQuery('❌ Erro ao carregar playlist');
  }
}

// Iniciar adição de playlist
async function startAddPlaylist(ctx, clientId) {
  try {
    const client = db.getClientById(clientId);
    if (!client) {
      await ctx.answerCbQuery('❌ Cliente não encontrado');
      return;
    }
    
    await ctx.answerCbQuery();
    
    ctx.session.playlistAdd = {
      clientId,
      step: 'name'
    };
    
    await ctx.editMessageText(
      `➕ *Adicionar Playlist*\n\n` +
      `📱 Cliente: ${client.name}\n\n` +
      `Qual o *nome* da playlist?`,
      {
        parse_mode: 'Markdown',
        ...keyboards.cancelMenu()
      }
    );
    
  } catch (error) {
    console.error('Erro ao iniciar adição:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Processar adição de playlist
async function handleAddPlaylistMessage(ctx) {
  const data = ctx.session.playlistAdd;
  if (!data) return false;
  
  const text = ctx.message.text.trim();
  
  try {
    switch (data.step) {
      case 'name':
        data.name = text;
        data.step = 'url';
        await ctx.reply(
          `✅ Nome: ${text}\n\n` +
          'Agora envie a *URL* da playlist:',
          { parse_mode: 'Markdown' }
        );
        return true;
        
      case 'url':
        // Validar URL
        if (!text.startsWith('http://') && !text.startsWith('https://')) {
          await ctx.reply('❌ URL inválida! Deve começar com http:// ou https://');
          return true;
        }
        
        data.url = text;
        
        // Definir valores padrão automaticamente
        data.protect = false;
        data.pin = '';
        data.type = 'general';
        
        // Finalizar diretamente
        await finishAddPlaylist(ctx, data.clientId, data);
        return true;
        
      default:
        return false;
    }
  } catch (error) {
    console.error('Erro ao processar playlist:', error);
    await ctx.reply(messages.errorMessage(error.message));
    delete ctx.session.playlistAdd;
    return true;
  }
}

// Confirmar proteção da playlist
async function handlePlaylistProtection(ctx, clientId, protect) {
  const data = ctx.session.playlistAdd;
  
  if (!data) {
    await ctx.answerCbQuery('❌ Sessão expirada');
    return;
  }
  
  await ctx.answerCbQuery();
  
  data.protect = protect === 'yes';
  
  if (data.protect) {
    data.step = 'pin';
    await ctx.editMessageText(
      '🔒 Proteção ativada!\n\n' +
      'Digite o PIN (4 dígitos):',
      { ...keyboards.cancelMenu() }
    );
  } else {
    data.step = 'type';
    await ctx.editMessageText(
      'Qual o tipo da playlist?',
      { ...keyboards.playlistTypeMenu(clientId, null, 'add') }
    );
  }
}

// Finalizar adição com tipo selecionado
async function finishAddPlaylist(ctx, clientId, data) {
  // Se data não for passado, usar da sessão (compatibilidade com callbacks antigos)
  if (!data) {
    data = ctx.session.playlistAdd;
  }
  
  if (!data) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('❌ Sessão expirada');
    return;
  }
  
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  
  // Verificar se é callback ou mensagem
  let loadingMessage;
  if (ctx.callbackQuery) {
    loadingMessage = await ctx.editMessageText(messages.loadingMessage('Adicionando playlist'));
  } else {
    loadingMessage = await ctx.reply(messages.loadingMessage('Adicionando playlist'));
  }
  
  try {
    const client = db.getClientById(clientId);
    const { service, session } = await getPlayerService(ctx, client);
    
    await service.addPlaylist(session.sessionData, {
      name: data.name,
      url: data.url,
      pin: data.pin || '',
      protect: data.protect || false,
      type: data.type || 'general'
    });
    
    db.logAction(clientId, 'add_playlist', true, `Playlist "${data.name}" adicionada`);
    
    const successMsg = messages.successMessage(`Playlist "${data.name}" adicionada com sucesso!`) + '\n\n' +
      'Carregando lista atualizada...';
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(successMsg);
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        successMsg
      );
    }
    
    delete ctx.session.playlistAdd;
    
    // Recarregar playlists (usar messageId da sessão se disponível)
    const messageId = ctx.session.currentPlaylists?.messageId || loadingMessage.message_id;
    setTimeout(() => listClientPlaylists(ctx, clientId, messageId), 1000);
    
  } catch (error) {
    console.error('Erro ao adicionar playlist:', error);
    db.logAction(clientId, 'add_playlist', false, error.message);
    
    const errorMsg = messages.errorMessage(`Erro: ${error.message}`);
    if (ctx.callbackQuery) {
      await ctx.editMessageText(errorMsg);
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        undefined,
        errorMsg
      );
    }
    delete ctx.session.playlistAdd;
  }
}

// Iniciar edição de playlist
async function startEditPlaylist(ctx, clientId, playlistId) {
  try {
    const client = db.getClientById(clientId);
    const cached = ctx.session.currentPlaylists;
    
    if (!cached) {
      await ctx.answerCbQuery('❌ Sessão expirada. Recarregue a lista.');
      return;
    }
    
    const playlist = cached.playlists.find(p => p.id === playlistId);
    if (!playlist) {
      await ctx.answerCbQuery('❌ Playlist não encontrada');
      return;
    }
    
    await ctx.answerCbQuery();
    
    ctx.session.playlistEdit = {
      clientId,
      playlistId,
      originalName: playlist.name,
      originalUrl: playlist.url,
      step: 'name'
    };
    
    await ctx.editMessageText(
      `✏️ Editar Playlist\n\n` +
      `📱 Cliente: ${client.name}\n` +
      `📋 Playlist: ${playlist.name}\n\n` +
      `Envie o novo nome da playlist:\n` +
      `(Atual: ${playlist.name})`,
      {
        ...keyboards.cancelMenu()
      }
    );
    
  } catch (error) {
    console.error('Erro ao iniciar edição:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Processar edição de playlist
async function handleEditPlaylistMessage(ctx) {
  const data = ctx.session.playlistEdit;
  if (!data) return false;
  
  const text = ctx.message.text.trim();
  
  try {
    switch (data.step) {
      case 'name':
        data.name = text;
        data.step = 'url';
        await ctx.reply(
          `✅ Nome: ${text}\n\n` +
          `Agora envie a nova URL da playlist:\n` +
          `(Atual: ${data.originalUrl})`
        );
        return true;
        
      case 'url':
        // Validar URL
        if (!text.startsWith('http://') && !text.startsWith('https://')) {
          await ctx.reply('❌ URL inválida! Deve começar com http:// ou https://');
          return true;
        }
        
        data.url = text;
        
        // Finalizar edição
        await finishEditPlaylist(ctx, data.clientId, data.playlistId, data);
        return true;
        
      default:
        return false;
    }
  } catch (error) {
    console.error('Erro ao processar edição:', error);
    await ctx.reply(messages.errorMessage(error.message));
    delete ctx.session.playlistEdit;
    return true;
  }
}

// Finalizar edição de playlist
async function finishEditPlaylist(ctx, clientId, playlistId, data) {
  await ctx.reply(messages.loadingMessage('Atualizando playlist'));
  
  try {
    const client = db.getClientById(clientId);
    const { service, session } = await getPlayerService(ctx, client);
    
    await service.editPlaylist(session.sessionData, playlistId, {
      name: data.name,
      url: data.url,
      pin: '',
      protect: false,
      type: 'general'
    });
    
    db.logAction(clientId, 'edit_playlist', true, `Playlist "${data.originalName}" editada para "${data.name}"`);
    
    await ctx.reply(
      messages.successMessage(`Playlist "${data.name}" atualizada!`) + '\n\n' +
      'Carregando lista atualizada...'
    );
    
    delete ctx.session.playlistEdit;
    
    // Recarregar playlists (usar messageId da sessão)
    const messageId = ctx.session.currentPlaylists?.messageId;
    setTimeout(() => listClientPlaylists(ctx, clientId, messageId), 1000);
    
  } catch (error) {
    console.error('Erro ao editar playlist:', error);
    db.logAction(clientId, 'edit_playlist', false, error.message);
    await ctx.reply(messages.errorMessage(`Erro: ${error.message}`));
    delete ctx.session.playlistEdit;
  }
}

// Deletar playlist
async function deletePlaylist(ctx, clientId, playlistId) {
  try {
    const client = db.getClientById(clientId);
    const cached = ctx.session.currentPlaylists;
    
    if (!cached) {
      await ctx.answerCbQuery('❌ Sessão expirada');
      return;
    }
    
    const playlist = cached.playlists.find(p => p.id === playlistId);
    if (!playlist) {
      await ctx.answerCbQuery('❌ Playlist não encontrada');
      return;
    }
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      messages.confirmDeleteMessage('playlist', playlist.name),
      {
        parse_mode: 'Markdown',
        ...keyboards.confirmDeleteMenu('playlist', playlistId, clientId)
      }
    );
    
  } catch (error) {
    console.error('Erro ao deletar:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Confirmar deleção de playlist
async function confirmDeletePlaylist(ctx, clientId, playlistId) {
  try {
    const client = db.getClientById(clientId);
    const cached = ctx.session.currentPlaylists;
    
    const playlist = cached.playlists.find(p => p.id === playlistId);
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(messages.loadingMessage('Deletando playlist'));
    
    const { service, session } = await getPlayerService(ctx, client);
    await service.deletePlaylist(session.sessionData, playlistId);
    
    db.logAction(clientId, 'delete_playlist', true, `Playlist "${playlist.name}" deletada`);
    
    await ctx.editMessageText(
      messages.successMessage(`Playlist "${playlist.name}" deletada!`) + '\n\n' +
      'Carregando lista atualizada...'
    );
    
    // Recarregar playlists (usar messageId da sessão)
    const messageId = ctx.session.currentPlaylists?.messageId || ctx.callbackQuery.message.message_id;
    setTimeout(() => listClientPlaylists(ctx, clientId, messageId), 1000);
    
  } catch (error) {
    console.error('Erro ao deletar playlist:', error);
    db.logAction(clientId, 'delete_playlist', false, error.message);
    await ctx.editMessageText(messages.errorMessage(`Erro: ${error.message}`));
  }
}

// Iniciar edição de cliente
async function startEditClient(ctx, clientId) {
  try {
    const client = db.getClientById(clientId);
    
    if (!client) {
      await ctx.answerCbQuery('❌ Cliente não encontrado');
      return;
    }
    
    await ctx.answerCbQuery();
    
    ctx.session.clientEdit = {
      clientId,
      step: 'field',
      originalData: { ...client }
    };
    
    // Montar botões baseado no tipo de player
    const buttons = [
      [Markup.button.callback('📝 Nome', `client:${clientId}:edit:name`)]
    ];
    
    // Domain/URL só para IBOPlayer (outros players não usam)
    if (client.player_type === 'iboplayer') {
      buttons.push([Markup.button.callback('🌐 Domain/URL', `client:${clientId}:edit:domain`)]);
    }
    
    buttons.push(
      [Markup.button.callback('🔑 MAC Address', `client:${clientId}:edit:mac`)],
      [Markup.button.callback('🔐 Device Key', `client:${clientId}:edit:key`)],
      [Markup.button.callback('🔙 Cancelar', `client:${clientId}:menu`)]
    );
    
    await ctx.editMessageText(
      `✏️ *Editar Cliente*\n\n` +
      `📱 Cliente: ${client.name}\n` +
      `🎮 Player: ${client.player_type}\n` +
      `🔑 MAC: ${client.mac_address}\n\n` +
      `Qual campo deseja editar?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
    
  } catch (error) {
    console.error('Erro ao iniciar edição:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Selecionar campo para editar
async function selectEditField(ctx, clientId, field) {
  try {
    const client = db.getClientById(clientId);
    
    await ctx.answerCbQuery();
    
    ctx.session.clientEdit = {
      clientId,
      step: 'value',
      field,
      originalData: { ...client }
    };
    
    const fieldNames = {
      'name': 'Nome',
      'domain': 'Domain/URL',
      'mac': 'MAC Address',
      'key': 'Device Key'
    };
    
    const currentValues = {
      'name': client.name,
      'domain': client.domain,
      'mac': client.mac_address,
      'key': client.device_key
    };
    
    await ctx.editMessageText(
      `✏️ *Editar ${fieldNames[field]}*\n\n` +
      `📱 Cliente: ${client.name}\n` +
      `Valor atual: \`${currentValues[field]}\`\n\n` +
      `Envie o novo valor:`,
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

// Processar edição de cliente
async function handleEditClientMessage(ctx) {
  const data = ctx.session.clientEdit;
  if (!data || data.step !== 'value') return false;
  
  const text = ctx.message.text.trim();
  
  try {
    const client = db.getClientById(data.clientId);
    
    // Validações específicas por campo
    if (data.field === 'mac' && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(text)) {
      await ctx.reply('❌ MAC Address inválido! Formato: 00:1A:79:XX:XX:XX');
      return true;
    }
    
    await ctx.reply(messages.loadingMessage('Atualizando cliente'));
    
    // Mapear campo para coluna do banco
    const fieldMap = {
      'name': 'name',
      'domain': 'domain',
      'mac': 'mac_address',
      'key': 'device_key'
    };
    
    const dbField = fieldMap[data.field];
    
    // Atualizar no banco
    db.updateClient(data.clientId, { [dbField]: text });
    
    // Se mudou MAC ou Device Key, invalidar sessão
    if (data.field === 'mac' || data.field === 'key') {
      await sessionManager.deleteSession(data.clientId, client.player_type);
      console.log(`🔄 Sessão invalidada para cliente ${data.clientId} (${data.field} alterado)`);
    }
    
    const fieldNames = {
      'name': 'Nome',
      'domain': 'Domain/URL',
      'mac': 'MAC Address',
      'key': 'Device Key'
    };
    
    db.logAction(data.clientId, 'edit_client', true, `${fieldNames[data.field]} atualizado`);
    
    await ctx.reply(
      messages.successMessage(`${fieldNames[data.field]} atualizado com sucesso!`) + '\n\n' +
      'Voltando ao menu do cliente...'
    );
    
    delete ctx.session.clientEdit;
    
    // Mostrar menu do cliente atualizado
    setTimeout(() => showClientMenu(ctx, data.clientId), 1000);
    
  } catch (error) {
    console.error('Erro ao editar cliente:', error);
    await ctx.reply(messages.errorMessage(`Erro: ${error.message}`));
    delete ctx.session.clientEdit;
  }
  
  return true;
}

// Deletar cliente
async function deleteClient(ctx, clientId) {
  try {
    const client = db.getClientById(clientId);
    if (!client) {
      await ctx.answerCbQuery('❌ Cliente não encontrado');
      return;
    }
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      messages.confirmDeleteMessage('client', client.name),
      {
        parse_mode: 'Markdown',
        ...keyboards.confirmDeleteMenu('client', clientId)
      }
    );
    
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Confirmar deleção de cliente
async function confirmDeleteClient(ctx, clientId) {
  try {
    const client = db.getClientById(clientId);
    
    await ctx.answerCbQuery();
    
    // Deletar sessão em cache
    await sessionManager.deleteSession(clientId, client.player_type);
    
    // Deletar do banco
    db.deleteClient(clientId);
    
    await ctx.editMessageText(
      messages.successMessage(`Cliente "${client.name}" deletado com sucesso!`)
    );
    
    // Voltar ao menu após 2 segundos
    setTimeout(async () => {
      await ctx.reply(
        messages.welcomeMessage(),
        {
          parse_mode: 'Markdown',
          ...keyboards.mainMenu()
        }
      );
    }, 2000);
    
  } catch (error) {
    console.error('Erro ao deletar cliente:', error);
    await ctx.editMessageText(messages.errorMessage(`Erro: ${error.message}`));
  }
}

// ========== TROCAR DOMÍNIO DA PLAYLIST ==========

// Iniciar troca de domínio
async function startChangeDomain(ctx, clientId, playlistId) {
  try {
    const client = db.getClientById(clientId);
    if (!client) {
      await ctx.answerCbQuery('❌ Cliente não encontrado');
      return;
    }
    
    await ctx.answerCbQuery();
    
    ctx.session.domainChange = {
      clientId,
      playlistId,
      playerType: client.player_type,
      step: 'new_domain'
    };
    
    await ctx.editMessageText(
      `🔄 *Trocar Domínio*\n\n` +
      `📺 Playlist ID: ${playlistId}\n` +
      `🎮 Player: ${client.player_type}\n\n` +
      `Digite o *novo domínio* (sem http/https):\n\n` +
      `💡 *Exemplos válidos:*\n` +
      `• servidor.com\n` +
      `• painel.exemplo.com\n` +
      `• servidor.com:8080`,
      {
        parse_mode: 'Markdown',
        ...keyboards.cancelMenu()
      }
    );
    
  } catch (error) {
    console.error('Erro ao iniciar troca de domínio:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Processar mensagem de novo domínio
async function handleChangeDomainMessage(ctx) {
  const data = ctx.session.domainChange;
  if (!data || data.step !== 'new_domain') return false;
  
  const newDomain = ctx.message.text.trim()
    .replace(/^https?:\/\//, '')  // Remover protocolo
    .replace(/\/$/, '')           // Remover barra final
    .toLowerCase();
  
  try {
    // Validar domínio
    const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?$/;
    if (!domainRegex.test(newDomain)) {
      await ctx.reply(
        '❌ Domínio inválido!\n\n' +
        'Digite apenas o domínio (ex: servidor.com ou servidor.com:8080)\n' +
        'Tente novamente:'
      );
      return true;
    }
    
    await ctx.reply(messages.loadingMessage('Buscando playlist e atualizando...'));
    
    // Buscar cliente e service
    const client = db.getClientById(data.clientId);
    
    // Obter service diretamente sem usar getPlayerService (que mostra menu)
    const playerServices = {
      'iboplayer': require('../services/iboplayer'),
      'ibopro': require('../services/ibopro'),
      'vuplayer': require('../services/vuplayer')
    };
    
    const service = playerServices[client.player_type];
    if (!service) {
      await ctx.reply('❌ Player não suportado');
      delete ctx.session.domainChange;
      return true;
    }
    
    // Obter sessão válida passando a função de login do service
    const session = await sessionManager.getValidSession(client, service.login);
    const playlists = await service.listPlaylists(session.sessionData);
    const playlist = playlists.find(p => p.id === data.playlistId);
    
    if (!playlist) {
      await ctx.reply('❌ Playlist não encontrada');
      delete ctx.session.domainChange;
      return true;
    }
    
    // Extrair domínio atual da URL
    const oldUrl = playlist.url;
    const urlMatch = oldUrl.match(/^(https?:\/\/)?([^\/\?]+)/);
    const oldDomain = urlMatch ? urlMatch[2] : null;
    
    if (!oldDomain) {
      await ctx.reply('❌ Não foi possível extrair o domínio da URL atual');
      delete ctx.session.domainChange;
      return true;
    }
    
    // Preservar protocolo (http ou https)
    const protocolMatch = oldUrl.match(/^(https?):\/\//);
    const protocol = protocolMatch ? protocolMatch[1] : 'http';
    
    // Substituir domínio mantendo o resto da URL
    const newUrl = oldUrl.replace(
      new RegExp(`^https?:\/\/${oldDomain.replace(/\./g, '\\.')}`, 'i'),
      `${protocol}://${newDomain}`
    );
    
    console.log('🔄 Trocar domínio:', {
      oldDomain,
      newDomain,
      oldUrl: oldUrl.substring(0, 100),
      newUrl: newUrl.substring(0, 100)
    });
    
    // Editar playlist com nova URL
    await service.editPlaylist(session.sessionData, data.playlistId, {
      name: playlist.name,
      url: newUrl,
      protect: playlist.is_protected,
      pin: '',
      type: playlist.type || 'general'
    });
    
    db.logAction(data.clientId, 'change_domain', true, 
      `${oldDomain} → ${newDomain}`);
    
    await ctx.reply(
      messages.successMessage(
        `Domínio atualizado!\n\n` +
        `📺 ${playlist.name}\n` +
        `🔄 ${oldDomain} → ${newDomain}`
      ),
      { parse_mode: 'Markdown' }
    );
    
    delete ctx.session.domainChange;
    
    // Voltar para a lista de playlists
    setTimeout(() => listClientPlaylists(ctx, data.clientId), 1500);
    
  } catch (error) {
    console.error('Erro ao trocar domínio:', error);
    await ctx.reply(messages.errorMessage(`Erro: ${error.message}`));
    delete ctx.session.domainChange;
  }
  
  return true;
}

module.exports = {
  getPlayerService,
  showClientMenu,
  listClientPlaylists,
  viewPlaylist,
  startAddPlaylist,
  handleAddPlaylistMessage,
  handlePlaylistProtection,
  finishAddPlaylist,
  startEditPlaylist,
  handleEditPlaylistMessage,
  startEditClient,
  selectEditField,
  handleEditClientMessage,
  startChangeDomain,
  handleChangeDomainMessage,
  deletePlaylist,
  confirmDeletePlaylist,
  deleteClient,
  confirmDeleteClient
};