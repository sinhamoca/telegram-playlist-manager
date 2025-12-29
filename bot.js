// bot.js - Bot principal do Telegram
const { Telegraf, session } = require('telegraf');
const config = require('./config');
const db = require('./database/db');
const sessionManager = require('./services/sessionManager');
const keyboards = require('./utils/keyboards');
const messages = require('./utils/messages');

// Handlers
const domainManage = require('./handlers/domainManage');

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
   
3️⃣ *Gerenciar Playlists:*
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

const quickManage = require('./handlers/quickManage');
const search = require('./handlers/search');
const clientManage = require('./handlers/clientManage');

// Handler principal de mensagens de texto
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;
    
    // Verificar se é resposta de algum fluxo
    if (await domainManage.handleAddDomainMessage(ctx)) return;
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

// ========== CALLBACKS ==========

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

module.exports = bot;