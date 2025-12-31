// bot.js - Bot principal do Telegram
const { Telegraf, session } = require('telegraf');
const config = require('./config');
const db = require('./database/db');
const sessionManager = require('./services/sessionManager');
const keyboards = require('./utils/keyboards');
const messages = require('./utils/messages');

// Handlers
const domainManage = require('./handlers/domainManage');
const serverManage = require('./handlers/serverManage');
const quickManage = require('./handlers/quickManage');
const search = require('./handlers/search');
const clientManage = require('./handlers/clientManage');

// Validar configurações
config.validateConfig();

// Inicializar banco de dados
db.initDatabase();

// Criar bot
const bot = new Telegraf(config.telegram.botToken);

// Middleware de sessão do Telegraf
bot.use(session());

// Middleware de autenticação (apenas admin)
bot.use((ctx, next) => {
  if (ctx.from && ctx.from.id === config.telegram.adminId) {
    return next();
  }
  
  ctx.reply('❌ Acesso negado. Este bot é privado.');
});

// Inicializar contexto de sessão
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

// ========== COMANDOS ==========

// /start
bot.command('start', async (ctx) => {
  try {
    await ctx.reply(
      messages.welcomeMessage(),
      {
        ...keyboards.mainMenu(),
        parse_mode: 'Markdown'
      }
    );
  } catch (error) {
    console.error('Erro no /start:', error);
    await ctx.reply(messages.errorMessage('Erro ao iniciar bot'));
  }
});

// /help
bot.command('help', async (ctx) => {
  const helpText = `📚 *Ajuda - Gerenciador IPTV*

*Comandos Disponíveis:*
/start - Menu principal
/stats - Ver estatísticas
/clean - Limpar sessões expiradas

*Como usar:*

1️⃣ *Gestão Rápida:*
   Cadastre e gerencie em segundos
   
2️⃣ *Buscar Cliente:*
   Digite nome ou MAC para buscar
   
3️⃣ *Servidores:*
   Agrupe clientes e faça ações em massa
   
4️⃣ *Gerenciar Playlists:*
   Adicione, edite ou delete playlists

*Suporte:* @seu_usuario`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// /stats
bot.command('stats', async (ctx) => {
  try {
    const stats = db.getStats();
    await ctx.reply(messages.statsMessage(stats), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Erro ao buscar stats:', error);
    await ctx.reply(messages.errorMessage('Erro ao buscar estatísticas'));
  }
});

// /clean
bot.command('clean', async (ctx) => {
  try {
    await ctx.reply(messages.loadingMessage('Limpando sessões expiradas'));
    const cleaned = await sessionManager.cleanExpiredSessions();
    await ctx.reply(messages.successMessage(`${cleaned} sessão(ões) expirada(s) removida(s)`));
  } catch (error) {
    console.error('Erro ao limpar sessões:', error);
    await ctx.reply(messages.errorMessage('Erro ao limpar sessões'));
  }
});

// ========== HANDLERS DE TEXTO ==========

// Handler principal de mensagens de texto
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;
    
    // Verificar se é resposta de algum fluxo
    if (await domainManage.handleAddDomainMessage(ctx)) return;
    if (await serverManage.handleAddServerMessage(ctx)) return;
    if (await serverManage.handleEditServerMessage(ctx)) return;
    if (await serverManage.handleBulkDomainMessage(ctx)) return;
    if (await clientManage.handleChangeDomainMessage(ctx)) return;
    if (await quickManage.handleQuickManageMessage(ctx)) return;
    if (await search.handleSearchMessage(ctx)) return;
    if (await clientManage.handleAddPlaylistMessage(ctx)) return;
    if (await clientManage.handleEditPlaylistMessage(ctx)) return;
    if (await clientManage.handleEditClientMessage(ctx)) return;
    
    // Menu principal - botões
    switch (text) {
      case '🔍 Buscar Cliente':
        await search.startSearch(ctx);
        break;
        
      case '⚡ Gestão Rápida':
        await quickManage.startQuickManage(ctx);
        break;
        
      case '🗂️ Servidores':
        await serverManage.listServers(ctx);
        break;
        
      case '📊 Listar Todos':
        await search.listAllClients(ctx);
        break;
        
      case '⚙️ Configurações':
        await ctx.reply(
          '⚙️ *Configurações*',
          {
            parse_mode: 'Markdown',
            ...keyboards.settingsMenu()
          }
        );
        break;
        
      case '📈 Estatísticas':
        const stats = db.getStats();
        await ctx.reply(messages.statsMessage(stats), { parse_mode: 'Markdown' });
        break;
        
      default:
        // Mensagem não reconhecida
        await ctx.reply(
          'Não entendi. Use o menu abaixo:',
          keyboards.mainMenu()
        );
    }
  } catch (error) {
    console.error('Erro no handler de texto:', error);
    await ctx.reply(messages.errorMessage('Erro ao processar mensagem'));
  }
});

// ========== HANDLER DE FOTOS (OCR) ==========

bot.on('photo', async (ctx) => {
  try {
    // Verificar se está no fluxo de gestão rápida
    if (await quickManage.handleQuickManagePhoto(ctx)) return;
    
    // Foto recebida fora de contexto
    await ctx.reply(
      '📸 Foto recebida!\n\n' +
      'Para escanear MAC e Device Key de uma imagem, ' +
      'primeiro inicie a *Gestão Rápida* no menu.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Erro no handler de foto:', error);
    await ctx.reply(messages.errorMessage('Erro ao processar foto'));
  }
});

// ========== CALLBACKS - SERVIDORES ==========

// Listar servidores
bot.action('server:list', async (ctx) => {
  await serverManage.listServers(ctx);
});

// Adicionar servidor
bot.action('server:add', async (ctx) => {
  await serverManage.startAddServer(ctx);
});

// Pular descrição do servidor
bot.action('server:skip_description', async (ctx) => {
  await serverManage.skipServerDescription(ctx);
});

// Selecionar cor do servidor
bot.action(/^server:color:(\d+)$/, async (ctx) => {
  const colorIndex = parseInt(ctx.match[1]);
  await serverManage.selectServerColor(ctx, colorIndex);
});

// Ver clientes por servidor
bot.action('server:list_clients', async (ctx) => {
  await serverManage.listServerSelection(ctx, 'view');
});

// Ver clientes de um servidor específico
bot.action(/^server:view:(.+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  await serverManage.viewServerClients(ctx, serverId);
});

// Selecionar servidor para editar
bot.action('server:select_edit', async (ctx) => {
  await serverManage.listServerSelection(ctx, 'edit');
});

// Editar servidor
bot.action(/^server:edit:(\d+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  await serverManage.startEditServer(ctx, serverId);
});

// Editar campo do servidor
bot.action(/^server:edit:(\d+):(name|description|color)$/, async (ctx) => {
  const serverId = ctx.match[1];
  const field = ctx.match[2];
  await serverManage.selectEditServerField(ctx, serverId, field);
});

// Editar cor do servidor
bot.action(/^server:edit_color:(\d+):(\d+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  const colorIndex = parseInt(ctx.match[2]);
  await serverManage.editServerColor(ctx, serverId, colorIndex);
});

// Selecionar servidor para deletar
bot.action('server:select_delete', async (ctx) => {
  await serverManage.listServerSelection(ctx, 'delete');
});

// Confirmar delete de servidor
bot.action(/^server:delete:(\d+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  await serverManage.confirmDeleteServer(ctx, serverId);
});

// Delete servidor confirmado
bot.action(/^server:confirm_delete:(\d+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  await serverManage.deleteServer(ctx, serverId);
});

// Trocar domínio em massa - selecionar servidor
bot.action('server:bulk_domain', async (ctx) => {
  await serverManage.listServerSelection(ctx, 'bulk_domain');
});

// Trocar domínio em massa - servidor selecionado
bot.action(/^server:bulk_domain:(\d+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  await serverManage.startBulkDomainChange(ctx, serverId);
});

// Trocar domínio em massa - modo selecionado
bot.action(/^server:bulk_mode:(\d+):(.+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  const mode = ctx.match[2];
  await serverManage.selectBulkMode(ctx, serverId, mode);
});

// Executar troca em massa
bot.action('server:bulk_execute', async (ctx) => {
  await serverManage.executeBulkDomainChange(ctx);
});

// Cancelar troca em massa
bot.action('server:bulk_cancel', async (ctx) => {
  await serverManage.cancelBulkDomain(ctx);
});

// ========== CALLBACKS - QUICK MANAGE ==========

// Callback: Seleção de player (gestão rápida)
bot.action(/^player:(.+)$/, async (ctx) => {
  const player = ctx.match[1];
  await quickManage.handlePlayerSelection(ctx, player);
});

// Callback: Seleção de domínio (gestão rápida)
bot.action(/^quick:domain:(.+)$/, async (ctx) => {
  const domainId = ctx.match[1];
  await quickManage.handleDomainSelection(ctx, domainId);
});

// Callback: Seleção de servidor (gestão rápida)
bot.action(/^quick:server:(.+)$/, async (ctx) => {
  const serverId = ctx.match[1];
  await quickManage.handleServerSelection(ctx, serverId);
});

// Callback: Confirmar dados escaneados
bot.action('quick:confirm_scan', async (ctx) => {
  await quickManage.handleConfirmScan(ctx);
});

// Callback: Corrigir MAC escaneado
bot.action('quick:correct_mac', async (ctx) => {
  await quickManage.handleCorrectMac(ctx);
});

// Callback: Corrigir Key escaneada
bot.action('quick:correct_key', async (ctx) => {
  await quickManage.handleCorrectKey(ctx);
});

// Callback: Voltar para confirmação do scan
bot.action('quick:back_to_confirm', async (ctx) => {
  await quickManage.handleBackToConfirm(ctx);
});

// Callback: Reescanear imagem
bot.action('quick:rescan', async (ctx) => {
  await quickManage.handleRescan(ctx);
});

// ========== CALLBACKS - CLIENTES ==========

// Callback: Menu do cliente
bot.action(/^client:(\d+):menu$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const client = db.getClientById(clientId);
  
  if (!client) {
    await ctx.answerCbQuery('❌ Cliente não encontrado');
    return;
  }
  
  await ctx.answerCbQuery();
  await clientManage.showClientMenu(ctx, client);
});

// Callback: Ver playlists
bot.action(/^client:(\d+):playlists$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  await clientManage.listClientPlaylists(ctx, clientId);
});

// Callback: Adicionar playlist
bot.action(/^client:(\d+):add$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  await clientManage.startAddPlaylist(ctx, clientId);
});

// Callback: Atribuir servidor ao cliente
bot.action(/^client:(\d+):assign_server$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  await serverManage.showServerSelectionForClient(ctx, clientId);
});

// Callback: Servidor selecionado para cliente
bot.action(/^client:(\d+):server:(.+)$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const serverId = ctx.match[2];
  await serverManage.assignServerToClient(ctx, clientId, serverId);
});

// Callback: Proteção da playlist
bot.action(/^client:(\d+):add:protect:(yes|no)$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const protect = ctx.match[2];
  await clientManage.handlePlaylistProtection(ctx, clientId, protect);
});

// Callback: Tipo da playlist (adicionar)
bot.action(/^client:(\d+):add:type:(.+)$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const type = ctx.match[2];
  await clientManage.finishAddPlaylist(ctx, clientId, type);
});

// Callback: Ver detalhes de playlist
bot.action(/^playlist:(\d+):(.+):view$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const playlistId = ctx.match[2];
  await clientManage.viewPlaylist(ctx, clientId, playlistId);
});

// Callback: Editar playlist
bot.action(/^playlist:(\d+):(.+):edit$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const playlistId = ctx.match[2];
  await clientManage.startEditPlaylist(ctx, clientId, playlistId);
});

// Callback: Deletar playlist
bot.action(/^playlist:(\d+):(.+):delete$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const playlistId = ctx.match[2];
  await clientManage.deletePlaylist(ctx, clientId, playlistId);
});

// Callback: Trocar domínio da playlist
bot.action(/^playlist:(\d+):(.+):change_domain$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const playlistId = ctx.match[2];
  await clientManage.startChangeDomain(ctx, clientId, playlistId);
});

// Callback: Confirmar deleção de playlist
bot.action(/^playlist:(\d+):(.+):confirm_delete$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const playlistId = ctx.match[2];
  await clientManage.confirmDeletePlaylist(ctx, clientId, playlistId);
});

// Callback: Deletar cliente
bot.action(/^client:(\d+):delete$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  await clientManage.deleteClient(ctx, clientId);
});

// Callback: Editar cliente - mostrar menu de campos
bot.action(/^client:(\d+):edit$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  await clientManage.startEditClient(ctx, clientId);
});

// Callback: Editar cliente - selecionar campo
bot.action(/^client:(\d+):edit:(name|domain|mac|key)$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  const field = ctx.match[2];
  await clientManage.selectEditField(ctx, clientId, field);
});

// Callback: Confirmar deleção de cliente
bot.action(/^client:(\d+):confirm_delete$/, async (ctx) => {
  const clientId = parseInt(ctx.match[1]);
  await clientManage.confirmDeleteClient(ctx, clientId);
});

// ========== CALLBACKS - MENU PRINCIPAL ==========

// Callback: Menu principal
bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    messages.welcomeMessage(),
    {
      parse_mode: 'Markdown',
      ...keyboards.mainMenuInline()
    }
  );
});

// Callbacks do menu inline
bot.action('search:start', async (ctx) => {
  await search.startSearch(ctx);
});

bot.action('quick:start', async (ctx) => {
  await quickManage.startQuickManage(ctx);
});

bot.action('list:all', async (ctx) => {
  await search.listAllClients(ctx);
});

// Callback: Quick manage
bot.action('quick_manage', async (ctx) => {
  await ctx.answerCbQuery();
  await quickManage.startQuickManage(ctx);
});

// ========== CALLBACKS - CONFIGURAÇÕES ==========

// Callback: Configurações - Limpar sessões
bot.action('settings:clean_sessions', async (ctx) => {
  await ctx.answerCbQuery('Limpando...');
  const cleaned = await sessionManager.cleanExpiredSessions();
  await ctx.editMessageText(
    messages.successMessage(`${cleaned} sessão(ões) expirada(s) removida(s)`)
  );
});

// Callback: Configurações - Ver logs
bot.action('settings:logs', async (ctx) => {
  await ctx.answerCbQuery();
  const logs = db.getRecentLogs(20);
  
  let messageText = '📋 *Últimas Atividades*\n━━━━━━━━━━━━━━━━━━━━\n\n';
  
  logs.forEach(log => {
    const emoji = log.success ? '✅' : '❌';
    const time = messages.timeAgo(log.created_at);
    messageText += `${emoji} ${log.action} - ${time}\n`;
    if (log.client_name) {
      messageText += `   👤 ${log.client_name}\n`;
    }
    if (log.server_name) {
      messageText += `   🗂️ ${log.server_name}\n`;
    }
  });
  
  await ctx.editMessageText(
    messageText,
    {
      parse_mode: 'Markdown',
      ...keyboards.settingsMenu()
    }
  );
});

// ========== CALLBACKS DE GERENCIAMENTO DE DOMÍNIOS ==========

// Callback: Listar domínios
bot.action('domains:list', async (ctx) => {
  await ctx.answerCbQuery();
  await domainManage.listDomains(ctx);
});

// Callback: Adicionar domínio
bot.action('domains:add', async (ctx) => {
  await domainManage.startAddDomain(ctx);
});

// Callback: Pular descrição
bot.action('domains:skip_description', async (ctx) => {
  await domainManage.skipDescription(ctx);
});

// Callback: Selecionar domínio para deletar
bot.action('domains:select_delete', async (ctx) => {
  await domainManage.selectDeleteDomain(ctx);
});

// Callback: Confirmar deleção de domínio
bot.action(/^domains:confirm_delete:(\d+)$/, async (ctx) => {
  const domainId = parseInt(ctx.match[1]);
  await domainManage.confirmDeleteDomain(ctx, domainId);
});

// Callback: Deletar domínio
bot.action(/^domains:delete:(\d+)$/, async (ctx) => {
  const domainId = parseInt(ctx.match[1]);
  await domainManage.deleteDomain(ctx, domainId);
});

// Callback: Voltar ao menu de configurações
bot.action('settings:menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '⚙️ *Configurações*',
    {
      parse_mode: 'Markdown',
      ...keyboards.settingsMenu()
    }
  );
});

// Callback: Cancelar
bot.action('cancel', async (ctx) => {
  await ctx.answerCbQuery('Cancelado');
  
  // Limpar estados
  delete ctx.session.quickManage;
  delete ctx.session.searchState;
  delete ctx.session.playlistAdd;
  delete ctx.session.playlistEdit;
  delete ctx.session.clientEdit;
  delete ctx.session.domainChange;
  delete ctx.session.domainAdd;
  delete ctx.session.serverAdd;
  delete ctx.session.serverEdit;
  delete ctx.session.bulkDomain;
  
  await ctx.editMessageText(
    '❌ Operação cancelada.\n\nUse o menu para começar:',
    {
      parse_mode: 'Markdown',
      ...keyboards.mainMenuInline()
    }
  );
});

// ========== LIMPEZA AUTOMÁTICA ==========

// Limpar sessões expiradas a cada 6 horas
setInterval(async () => {
  console.log('🔄 Limpeza automática de sessões...');
  const cleaned = await sessionManager.cleanExpiredSessions();
  if (cleaned > 0) {
    console.log(`✅ ${cleaned} sessão(ões) expirada(s) removida(s)`);
  }
}, 6 * 60 * 60 * 1000); // 6 horas

// ========== INLINE MODE - BUSCA RÁPIDA ==========

bot.on('inline_query', async (ctx) => {
  try {
    const query = ctx.inlineQuery.query.trim();
    
    // Verificar se é o admin
    if (ctx.from.id !== config.telegram.adminId) {
      return ctx.answerInlineQuery([], {
        switch_pm_text: '❌ Acesso negado',
        switch_pm_parameter: 'denied',
        cache_time: 0
      });
    }
    
    // Se query vazia, mostrar dica
    if (!query) {
      return ctx.answerInlineQuery([], {
        switch_pm_text: '🔍 Digite nome ou MAC do cliente',
        switch_pm_parameter: 'search',
        cache_time: 0
      });
    }
    
    // Buscar clientes no banco
    const clients = db.searchClients(query);
    
    // Se não encontrou nada
    if (clients.length === 0) {
      return ctx.answerInlineQuery([], {
        switch_pm_text: `❌ Nenhum cliente encontrado para "${query}"`,
        switch_pm_parameter: 'not_found',
        cache_time: 0
      });
    }
    
    // Montar resultados inline
    const results = clients.slice(0, 10).map((client, index) => {
      const playerNames = {
        'iboplayer': 'IBOPlayer',
        'ibopro': 'IBOPro',
        'vuplayer': 'VU Player'
      };
      
      const playerName = playerNames[client.player_type] || client.player_type;
      const serverInfo = client.server_name ? `\n🗂️ ${client.server_color} ${client.server_name}` : '';
      const sessionStatus = client.has_active_session ? '✅' : '⚪';
      
      // Descrição curta para o resultado
      const description = `${playerName} | ${client.mac_address}${client.server_name ? ` | ${client.server_name}` : ''}`;
      
      // Mensagem que será enviada ao clicar
      const messageText = 
        `📱 *${client.name}* ${sessionStatus}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *Player:* ${playerName}\n` +
        `🔑 *MAC:* \`${client.mac_address}\`\n` +
        (client.domain ? `🌐 *Domínio:* ${client.domain}\n` : '') +
        serverInfo +
        `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `Selecione uma opção abaixo:`;
      
      return {
        type: 'article',
        id: `client_${client.id}_${Date.now()}`,
        title: `📱 ${client.name}`,
        description: description,
        thumb_url: 'https://cdn-icons-png.flaticon.com/512/3171/3171927.png',
        input_message_content: {
          message_text: messageText,
          parse_mode: 'Markdown'
        },
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Ver Playlists', callback_data: `client:${client.id}:playlists` }],
            [{ text: '➕ Adicionar Playlist', callback_data: `client:${client.id}:add` }],
            [{ text: '✏️ Editar Cliente', callback_data: `client:${client.id}:edit` }],
            [{ text: '🗑️ Excluir Cliente', callback_data: `client:${client.id}:delete` }]
          ]
        }
      };
    });
    
    // Responder com resultados
    await ctx.answerInlineQuery(results, {
      cache_time: 5, // Cache de 5 segundos
      is_personal: true,
      switch_pm_text: `📊 ${clients.length} cliente(s) encontrado(s)`,
      switch_pm_parameter: 'results'
    });
    
  } catch (error) {
    console.error('Erro no inline query:', error);
    await ctx.answerInlineQuery([], {
      switch_pm_text: '❌ Erro na busca',
      switch_pm_parameter: 'error',
      cache_time: 0
    });
  }
});

// Handler para quando clicar em resultado inline (chosen_inline_result)
bot.on('chosen_inline_result', async (ctx) => {
  try {
    const resultId = ctx.chosenInlineResult.result_id;
    const match = resultId.match(/^client_(\d+)_/);
    
    if (match) {
      const clientId = parseInt(match[1]);
      console.log(`🔍 Inline: Cliente ${clientId} selecionado`);
    }
  } catch (error) {
    console.error('Erro no chosen_inline_result:', error);
  }
});

module.exports = bot;