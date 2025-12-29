// handlers/search.js - Handler de busca de clientes
const db = require('../database/db');
const keyboards = require('../utils/keyboards');
const messages = require('../utils/messages');

// Estado de busca
const SEARCH_STATE = 'waiting_search_query';

// Iniciar busca
async function startSearch(ctx) {
  ctx.session.searchState = SEARCH_STATE;
  
  await ctx.reply(
    '🔍 *Buscar Cliente*\n\n' +
    'Digite o *nome* ou *MAC address* do cliente:\n\n' +
    '_Você pode digitar apenas parte do nome ou MAC_',
    {
      parse_mode: 'Markdown',
      ...keyboards.cancelMenu()
    }
  );
}

// Processar busca
async function handleSearchMessage(ctx) {
  if (ctx.session.searchState !== SEARCH_STATE) {
    return false;
  }
  
  const query = ctx.message.text.trim();
  
  if (query.length < 2) {
    await ctx.reply(
      '❌ Digite pelo menos 2 caracteres para buscar.',
      { ...keyboards.cancelMenu() }
    );
    return true;
  }
  
  try {
    const clients = db.searchClients(query);
    
    const messageText = messages.searchResultsMessage(clients, query);
    
    await ctx.reply(
      messageText,
      {
        parse_mode: 'Markdown',
        ...keyboards.clientsListMenu(clients)
      }
    );
    
    delete ctx.session.searchState;
    return true;
    
  } catch (error) {
    console.error('Erro ao buscar:', error);
    await ctx.reply(messages.errorMessage('Erro ao buscar clientes'));
    delete ctx.session.searchState;
    return true;
  }
}

// Listar todos os clientes
async function listAllClients(ctx) {
  try {
    const clients = db.getAllClients();
    
    if (clients.length === 0) {
      await ctx.reply(
        '📊 *Nenhum cliente cadastrado*\n\n' +
        'Use "⚡ Gestão Rápida" para cadastrar seu primeiro cliente!',
        {
          parse_mode: 'Markdown',
          ...keyboards.mainMenu()
        }
      );
      return;
    }
    
    let messageText = `📊 *Todos os Clientes* (${clients.length})\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    clients.slice(0, 20).forEach((client, index) => {
      const playerEmoji = {
        'iboplayer': '📱',
        'ibopro': '📱',
        'vuplayer': '📱'
      }[client.player_type] || '📱';
      
      const sessionEmoji = client.has_active_session ? '✅' : '⚪';
      
      messageText += `${index + 1}. ${playerEmoji} *${client.name}* ${sessionEmoji}\n`;
      messageText += `   🔑 \`${client.mac_address}\`\n`;
      
      if (client.last_used_at) {
        messageText += `   ⏰ ${messages.timeAgo(client.last_used_at)}\n`;
      }
      
      messageText += `\n`;
    });
    
    if (clients.length > 20) {
      messageText += `\n_Mostrando apenas os 20 primeiros_\n`;
      messageText += `Use 🔍 Buscar para encontrar outros`;
    }
    
    messageText += `\n\nSelecione um cliente:`;
    
    await ctx.reply(
      messageText,
      {
        parse_mode: 'Markdown',
        ...keyboards.clientsListMenu(clients)
      }
    );
    
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    await ctx.reply(messages.errorMessage('Erro ao listar clientes'));
  }
}

module.exports = {
  startSearch,
  handleSearchMessage,
  listAllClients,
  SEARCH_STATE
};
