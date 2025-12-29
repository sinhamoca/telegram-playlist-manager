// utils/messages.js - Formatação de mensagens
const { getHoursUntilExpiry } = require('../services/sessionManager');

// Mensagem de boas-vindas
function welcomeMessage() {
  return `👋 *Bem-vindo ao Gerenciador IPTV!*

Gerencie seus clientes IPTV de forma rápida e fácil.

*Funcionalidades:*
🔍 Buscar clientes por nome ou MAC
⚡ Gestão rápida (cadastro + gerenciar)
➕ Cadastrar novos clientes
📋 Gerenciar playlists
📊 Estatísticas e logs

*Suporte a:*
📱 IBOPlayer
📱 IBOPro  
📱 VU Player Pro

Escolha uma opção abaixo para começar:`;
}

// Detalhes do cliente
function clientDetailsMessage(client, session = null) {
  const playerNames = {
    'iboplayer': 'IBOPlayer',
    'ibopro': 'IBOPro',
    'vuplayer': 'VU Player Pro'
  };
  
  const playerName = playerNames[client.player_type] || client.player_type;
  const createdDate = new Date(client.created_at).toLocaleDateString('pt-BR');
  
  let message = `📱 *${client.name}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `🎮 *Player:* ${playerName}\n`;
  message += `🔑 *MAC:* \`${client.mac_address}\`\n`;
  
  if (client.domain) {
    message += `🌐 *Domínio:* ${client.domain}\n`;
  }
  
  message += `📅 *Cadastrado:* ${createdDate}\n`;
  
  if (session && !getHoursUntilExpiry(session)) {
    const hoursLeft = getHoursUntilExpiry(session);
    message += `✅ *Sessão ativa:* expira em ${hoursLeft}h\n`;
  } else if (client.has_active_session) {
    message += `⚠️ *Sessão:* pode estar expirada\n`;
  } else {
    message += `🔐 *Sessão:* não iniciada\n`;
  }
  
  if (client.notes) {
    message += `📝 *Notas:* ${client.notes}\n`;
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `\nO que deseja fazer?`;
  
  return message;
}

// Lista de playlists
function playlistsListMessage(clientName, playlists) {
  let message = `📋 *Playlists de ${clientName}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (playlists.length === 0) {
    message += `Nenhuma playlist cadastrada.\n\n`;
    message += `Use o botão "➕ Adicionar Nova" abaixo.`;
    return message;
  }
  
  playlists.forEach((playlist, index) => {
    const emoji = playlist.is_protected ? '🔒' : '📺';
    const number = index + 1;
    
    message += `${number}. ${emoji} *${playlist.name}*\n`;
    message += `   🔗 \`${playlist.url}\`\n`;
    
    if (playlist.type && playlist.type !== 'general') {
      message += `   📌 Tipo: ${playlist.type}\n`;
    }
    
    message += `\n`;
  });
  
  message += `\nTotal: ${playlists.length} playlist(s)`;
  
  return message;
}

// Detalhes de uma playlist
function playlistDetailsMessage(playlist, clientName) {
  const emoji = playlist.is_protected ? '🔒' : '📺';
  
  let message = `${emoji} *${playlist.name}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `👤 *Cliente:* ${clientName}\n`;
  message += `🔗 *URL:* \`${playlist.url}\`\n`;
  message += `📌 *Tipo:* ${playlist.type || 'general'}\n`;
  message += `🔒 *Protegida:* ${playlist.is_protected ? 'Sim' : 'Não'}\n`;
  
  if (playlist.is_protected && playlist.pin) {
    message += `🔑 *PIN:* ${playlist.pin}\n`;
  }
  
  message += `\nO que deseja fazer?`;
  
  return message;
}

// Busca de clientes (resultados)
function searchResultsMessage(clients, query) {
  let message = `🔍 *Resultados para:* "${query}"\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (clients.length === 0) {
    message += `Nenhum cliente encontrado.\n\n`;
    message += `Tente buscar por:\n`;
    message += `• Nome do cliente\n`;
    message += `• MAC address (completo ou parcial)`;
    return message;
  }
  
  message += `Encontrado(s) ${clients.length} cliente(s):\n\n`;
  
  clients.slice(0, 10).forEach((client, index) => {
    const playerEmoji = {
      'iboplayer': '📱',
      'ibopro': '📱',
      'vuplayer': '📱'
    }[client.player_type] || '📱';
    
    message += `${index + 1}. ${playerEmoji} *${client.name}*\n`;
    message += `   🔑 ${client.mac_address}\n`;
    message += `   📅 ${new Date(client.created_at).toLocaleDateString('pt-BR')}\n\n`;
  });
  
  if (clients.length > 10) {
    message += `\n_Mostrando apenas os 10 primeiros resultados_`;
  }
  
  message += `\nSelecione um cliente abaixo:`;
  
  return message;
}

// Estatísticas
function statsMessage(stats) {
  let message = `📈 *Estatísticas do Sistema*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `👥 *Total de Clientes:* ${stats.totalClients}\n`;
  message += `✅ *Sessões Ativas:* ${stats.activeSessions}\n`;
  message += `📊 *Atividade (24h):* ${stats.recentActivity} ações\n\n`;
  
  message += `*Por Player:*\n`;
  stats.byPlayer.forEach(({ player_type, count }) => {
    const names = {
      'iboplayer': 'IBOPlayer',
      'ibopro': 'IBOPro',
      'vuplayer': 'VU Player'
    };
    message += `📱 ${names[player_type] || player_type}: ${count}\n`;
  });
  
  return message;
}

// Progresso/loading
function loadingMessage(action = 'Processando') {
  return `⏳ ${action}...`;
}

// Sucesso
function successMessage(message) {
  return `✅ ${message}`;
}

// Erro
function errorMessage(message) {
  return `❌ ${message}`;
}

// Confirmação de exclusão
function confirmDeleteMessage(type, name) {
  const typeText = type === 'client' ? 'cliente' : 'playlist';
  
  return `⚠️ *Confirmar Exclusão*\n\n` +
         `Tem certeza que deseja deletar ${typeText}:\n` +
         `*${name}*?\n\n` +
         `⚠️ Esta ação não pode ser desfeita!`;
}

// Formato de tempo relativo
function timeAgo(date) {
  if (!date) return 'Nunca';
  
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Agora mesmo';
  if (diffMins < 60) return `Há ${diffMins}min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  return `Há ${diffDays}d`;
}

module.exports = {
  welcomeMessage,
  clientDetailsMessage,
  playlistsListMessage,
  playlistDetailsMessage,
  searchResultsMessage,
  statsMessage,
  loadingMessage,
  successMessage,
  errorMessage,
  confirmDeleteMessage,
  timeAgo
};
