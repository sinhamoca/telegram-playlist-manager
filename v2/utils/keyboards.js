// utils/keyboards.js - Teclados do Telegram
const { Markup } = require('telegraf');

// Menu Principal
function mainMenu() {
  return Markup.keyboard([
    ['🔍 Buscar Cliente', '⚡ Gestão Rápida'],
    ['🗂️ Servidores', '📊 Listar Todos'],
    ['⚙️ Configurações', '📈 Estatísticas']
  ]).resize();
}

// Menu principal inline (para callbacks)
function mainMenuInline() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔍 Buscar', 'search:start'),
      Markup.button.callback('⚡ Gestão Rápida', 'quick:start')
    ],
    [
      Markup.button.callback('🗂️ Servidores', 'server:list'),
      Markup.button.callback('📊 Listar Todos', 'list:all')
    ]
  ]);
}

// Menu de seleção de player
function playerSelectionMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📱 IBOPlayer', 'player:iboplayer'),
      Markup.button.callback('📱 IBOPro', 'player:ibopro')
    ],
    [
      Markup.button.callback('📱 VU Player', 'player:vuplayer')
    ],
    [Markup.button.callback('🔙 Cancelar', 'cancel')]
  ]);
}

// Menu do cliente (atualizado com opção de servidor)
function clientMenu(clientId, clientName, serverInfo = null) {
  const buttons = [
    [Markup.button.callback('📋 Ver Playlists', `client:${clientId}:playlists`)],
    [Markup.button.callback('➕ Adicionar Playlist', `client:${clientId}:add`)],
    [Markup.button.callback('🗂️ Atribuir Servidor', `client:${clientId}:assign_server`)],
    [Markup.button.callback('✏️ Editar Cliente', `client:${clientId}:edit`)],
    [Markup.button.callback('🗑️ Excluir Cliente', `client:${clientId}:delete`)],
    [Markup.button.callback('🔙 Voltar ao Menu', 'menu:main')]
  ];
  
  return Markup.inlineKeyboard(buttons);
}

// Menu de playlists
function playlistsMenu(clientId, playlists) {
  const buttons = [];
  
  playlists.slice(0, 10).forEach((playlist, index) => {
    const emoji = playlist.is_protected ? '🔒' : '📺';
    buttons.push([
      Markup.button.callback(
        `${emoji} ${playlist.name}`,
        `playlist:${clientId}:${playlist.id}:view`
      )
    ]);
  });
  
  buttons.push([
    Markup.button.callback('➕ Adicionar Nova', `client:${clientId}:add`),
    Markup.button.callback('🔄 Atualizar', `client:${clientId}:playlists`)
  ]);
  
  buttons.push([Markup.button.callback('🔙 Voltar', `client:${clientId}:menu`)]);
  
  return Markup.inlineKeyboard(buttons);
}

// Menu de ações da playlist
function playlistActionsMenu(clientId, playlistId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✏️ Editar', `playlist:${clientId}:${playlistId}:edit`),
      Markup.button.callback('🗑️ Deletar', `playlist:${clientId}:${playlistId}:delete`)
    ],
    [Markup.button.callback('🔄 Trocar Domínio', `playlist:${clientId}:${playlistId}:change_domain`)],
    [Markup.button.callback('🔙 Voltar', `client:${clientId}:playlists`)]
  ]);
}

// Confirmação de exclusão
function confirmDeleteMenu(type, id, clientId = null) {
  const callbackPrefix = type === 'client' ? `client:${id}` : `playlist:${clientId}:${id}`;
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Sim, deletar', `${callbackPrefix}:confirm_delete`),
      Markup.button.callback('❌ Cancelar', type === 'client' ? `client:${id}:menu` : `client:${clientId}:playlists`)
    ]
  ]);
}

// Menu de tipo de playlist
function playlistTypeMenu(clientId, playlistId = null, action = 'add') {
  const prefix = playlistId ? `playlist:${clientId}:${playlistId}` : `client:${clientId}`;
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📺 Geral', `${prefix}:${action}:type:general`),
      Markup.button.callback('🎬 Filmes', `${prefix}:${action}:type:movie`)
    ],
    [
      Markup.button.callback('📺 Séries', `${prefix}:${action}:type:series`),
      Markup.button.callback('🔙 Cancelar', 'cancel')
    ]
  ]);
}

// Menu de proteção com PIN
function playlistProtectionMenu(clientId, playlistId = null, action = 'add') {
  const prefix = playlistId ? `playlist:${clientId}:${playlistId}` : `client:${clientId}`;
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Sim', `${prefix}:${action}:protect:yes`),
      Markup.button.callback('❌ Não', `${prefix}:${action}:protect:no`)
    ]
  ]);
}

// Lista de clientes (inline) - atualizado com info de servidor
function clientsListMenu(clients) {
  const buttons = [];
  
  clients.slice(0, 10).forEach(client => {
    const playerEmoji = {
      'iboplayer': '📱',
      'ibopro': '📱',
      'vuplayer': '📱'
    }[client.player_type] || '📱';
    
    // Mostrar cor do servidor se tiver
    const serverIndicator = client.server_color ? ` ${client.server_color}` : '';
    
    buttons.push([
      Markup.button.callback(
        `${playerEmoji} ${client.name}${serverIndicator}`,
        `client:${client.id}:menu`
      )
    ]);
  });
  
  if (clients.length === 0) {
    buttons.push([Markup.button.callback('➕ Cadastrar Primeiro Cliente', 'quick_manage')]);
  }
  
  buttons.push([Markup.button.callback('🔙 Menu Principal', 'menu:main')]);
  
  return Markup.inlineKeyboard(buttons);
}

// Menu de configurações
function settingsMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Gerenciar Domínios', 'domains:list')],
    [Markup.button.callback('🗑️ Limpar Sessões Expiradas', 'settings:clean_sessions')],
    [Markup.button.callback('📊 Ver Logs', 'settings:logs')],
    [Markup.button.callback('🔙 Voltar', 'menu:main')]
  ]);
}

// Menu de servidores
function serversMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Novo Servidor', 'server:add')],
    [Markup.button.callback('📋 Ver Clientes por Servidor', 'server:list_clients')],
    [Markup.button.callback('🔄 Trocar Domínio em Massa', 'server:bulk_domain')],
    [Markup.button.callback('🔙 Voltar', 'menu:main')]
  ]);
}

// Menu de seleção de servidor para cliente
function serverSelectionMenu(servers, clientId, currentServerId = null) {
  const buttons = servers.map(server => {
    const isCurrent = server.id === currentServerId;
    return [
      Markup.button.callback(
        `${server.color} ${server.name}${isCurrent ? ' ✓' : ''}`,
        `client:${clientId}:server:${server.id}`
      )
    ];
  });
  
  // Opção de remover do servidor
  if (currentServerId) {
    buttons.push([
      Markup.button.callback('⚪ Remover do Servidor', `client:${clientId}:server:none`)
    ]);
  }
  
  buttons.push([Markup.button.callback('🔙 Cancelar', `client:${clientId}:menu`)]);
  
  return Markup.inlineKeyboard(buttons);
}

// Menu de cancelamento simples
function cancelMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Cancelar', 'cancel')]
  ]);
}

// Remover teclado
function removeKeyboard() {
  return Markup.removeKeyboard();
}

module.exports = {
  mainMenu,
  mainMenuInline,
  playerSelectionMenu,
  clientMenu,
  playlistsMenu,
  playlistActionsMenu,
  confirmDeleteMenu,
  playlistTypeMenu,
  playlistProtectionMenu,
  clientsListMenu,
  settingsMenu,
  serversMenu,
  serverSelectionMenu,
  cancelMenu,
  removeKeyboard
};