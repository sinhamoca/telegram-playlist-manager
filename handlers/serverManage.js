// handlers/serverManage.js - Gerenciamento de servidores (grupos de clientes)
const { Markup } = require('telegraf');
const db = require('../database/db');
const sessionManager = require('../services/sessionManager');
const keyboards = require('../utils/keyboards');
const messages = require('../utils/messages');

// Cores disponíveis para servidores
const SERVER_COLORS = ['🔵', '🟢', '🔴', '🟡', '🟠', '🟣', '⚪', '🟤'];

// Modos de troca de domínio em massa
const BULK_DOMAIN_MODES = {
  ALL: 'all',
  FIRST: 'first',
  SPECIFIC: 'specific'
};

// ========== LISTAR SERVIDORES ==========

async function listServers(ctx) {
  try {
    const servers = db.getServersWithClientCount();
    
    let messageText = '🗂️ *Servidores (Grupos)*\n';
    messageText += '━━━━━━━━━━━━━━━━━━━━\n\n';
    
    if (servers.length === 0) {
      messageText += '⚠️ Nenhum servidor cadastrado.\n\n';
      messageText += 'Servidores ajudam a organizar seus clientes em grupos.\n';
      messageText += 'Use "➕ Novo Servidor" para criar o primeiro!';
    } else {
      servers.forEach((server) => {
        messageText += `${server.color} *${server.name}*\n`;
        messageText += `   👥 ${server.client_count} cliente(s)\n`;
        if (server.description) {
          messageText += `   📝 ${server.description}\n`;
        }
        messageText += '\n';
      });
      messageText += `\n📊 Total: ${servers.length} servidor(es)`;
    }
    
    const buttons = [
      [Markup.button.callback('➕ Novo Servidor', 'server:add')],
      [Markup.button.callback('📋 Ver Clientes por Servidor', 'server:list_clients')]
    ];
    
    if (servers.length > 0) {
      buttons.push([Markup.button.callback('✏️ Editar Servidor', 'server:select_edit')]);
      buttons.push([Markup.button.callback('🔄 Trocar Domínio em Massa', 'server:bulk_domain')]);
      buttons.push([Markup.button.callback('🗑️ Remover Servidor', 'server:select_delete')]);
    }
    
    buttons.push([Markup.button.callback('🔙 Voltar', 'menu:main')]);
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } else {
      await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  } catch (error) {
    console.error('Erro ao listar servidores:', error);
    await ctx.reply(messages.errorMessage('Erro ao listar servidores'));
  }
}

// ========== ADICIONAR SERVIDOR ==========

async function startAddServer(ctx) {
  try {
    await ctx.answerCbQuery();
    ctx.session.serverAdd = { step: 'name' };
    
    await ctx.editMessageText(
      '➕ *Novo Servidor*\n\nDigite o *nome* do servidor:\n\n💡 _Ex: Servidor Premium, Revenda João, Kids_',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancelar', 'server:list')]])
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function handleAddServerMessage(ctx) {
  const data = ctx.session.serverAdd;
  if (!data) return false;
  
  const text = ctx.message.text.trim();
  
  try {
    if (data.step === 'name') {
      if (text.length < 2) {
        await ctx.reply('❌ Nome muito curto! Mínimo 2 caracteres.');
        return true;
      }
      if (text.length > 50) {
        await ctx.reply('❌ Nome muito longo! Máximo 50 caracteres.');
        return true;
      }
      const existing = db.getServerByName(text);
      if (existing) {
        await ctx.reply('❌ Já existe um servidor com este nome!');
        return true;
      }
      
      ctx.session.serverAdd = { step: 'description', name: text };
      
      await ctx.reply(
        `📝 *Descrição (opcional)*\n\nNome: *${text}*\n\nDigite uma descrição ou envie "pular":`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('⏭️ Pular', 'server:skip_description')]])
        }
      );
    } else if (data.step === 'description') {
      const description = text.toLowerCase() === 'pular' ? null : text;
      ctx.session.serverAdd.description = description;
      ctx.session.serverAdd.step = 'color';
      
      const colorButtons = SERVER_COLORS.map((color, index) => Markup.button.callback(color, `server:color:${index}`));
      const colorRows = [];
      for (let i = 0; i < colorButtons.length; i += 4) {
        colorRows.push(colorButtons.slice(i, i + 4));
      }
      
      await ctx.reply(
        `🎨 *Escolha uma cor*\n\nNome: *${data.name}*\n${description ? `Descrição: ${description}\n` : ''}\nSelecione a cor do servidor:`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(colorRows) }
      );
    }
  } catch (error) {
    console.error('Erro ao adicionar servidor:', error);
    await ctx.reply(messages.errorMessage('Erro ao adicionar servidor'));
    delete ctx.session.serverAdd;
  }
  return true;
}

async function skipServerDescription(ctx) {
  try {
    await ctx.answerCbQuery();
    const data = ctx.session.serverAdd;
    if (!data || !data.name) {
      await ctx.reply('❌ Erro: dados não encontrados');
      return;
    }
    
    ctx.session.serverAdd.description = null;
    ctx.session.serverAdd.step = 'color';
    
    const colorButtons = SERVER_COLORS.map((color, index) => Markup.button.callback(color, `server:color:${index}`));
    const colorRows = [];
    for (let i = 0; i < colorButtons.length; i += 4) {
      colorRows.push(colorButtons.slice(i, i + 4));
    }
    
    await ctx.editMessageText(
      `🎨 *Escolha uma cor*\n\nNome: *${data.name}*\n\nSelecione a cor do servidor:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(colorRows) }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function selectServerColor(ctx, colorIndex) {
  try {
    await ctx.answerCbQuery();
    const data = ctx.session.serverAdd;
    if (!data || !data.name) {
      await ctx.reply('❌ Erro: dados não encontrados');
      return;
    }
    
    const color = SERVER_COLORS[colorIndex] || '🔵';
    const serverId = db.createServer(data.name, data.description, color);
    db.logServerAction(serverId, 'create_server', true, `Servidor "${data.name}" criado`);
    
    await ctx.editMessageText(
      messages.successMessage(`Servidor "${data.name}" criado com sucesso!`) +
      `\n\n${color} *${data.name}*` + (data.description ? `\n📝 ${data.description}` : ''),
      { parse_mode: 'Markdown' }
    );
    
    delete ctx.session.serverAdd;
    setTimeout(() => listServers(ctx), 1500);
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro ao criar servidor');
    delete ctx.session.serverAdd;
  }
}

// ========== VER CLIENTES POR SERVIDOR ==========

async function listServerSelection(ctx, action = 'view') {
  try {
    await ctx.answerCbQuery();
    const servers = db.getServersWithClientCount();
    
    if (servers.length === 0) {
      await ctx.editMessageText('⚠️ Nenhum servidor cadastrado.\n\nCrie um servidor primeiro!', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Novo Servidor', 'server:add')],
          [Markup.button.callback('🔙 Voltar', 'server:list')]
        ])
      });
      return;
    }
    
    const buttons = servers.map(server => [
      Markup.button.callback(`${server.color} ${server.name} (${server.client_count})`, `server:${action}:${server.id}`)
    ]);
    
    if (action === 'view') {
      const clientsWithoutServer = db.getClientsWithoutServer();
      if (clientsWithoutServer.length > 0) {
        buttons.push([Markup.button.callback(`⚪ Sem Servidor (${clientsWithoutServer.length})`, `server:${action}:none`)]);
      }
    }
    
    buttons.push([Markup.button.callback('🔙 Voltar', 'server:list')]);
    
    const titles = {
      'view': '📋 *Ver Clientes por Servidor*',
      'edit': '✏️ *Editar Servidor*',
      'delete': '🗑️ *Remover Servidor*',
      'bulk_domain': '🔄 *Trocar Domínio em Massa*'
    };
    
    await ctx.editMessageText(`${titles[action] || titles.view}\n\nSelecione um servidor:`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function viewServerClients(ctx, serverId) {
  try {
    await ctx.answerCbQuery();
    
    let clients, serverName, serverColor;
    
    if (serverId === 'none') {
      clients = db.getClientsWithoutServer();
      serverName = 'Sem Servidor';
      serverColor = '⚪';
    } else {
      const server = db.getServerById(parseInt(serverId));
      if (!server) {
        await ctx.editMessageText('❌ Servidor não encontrado');
        return;
      }
      clients = db.getClientsByServer(parseInt(serverId));
      serverName = server.name;
      serverColor = server.color;
    }
    
    let messageText = `${serverColor} *${serverName}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (clients.length === 0) {
      messageText += '⚠️ Nenhum cliente neste servidor.\n';
    } else {
      clients.forEach((client, index) => {
        const sessionEmoji = client.has_active_session ? '✅' : '⚪';
        messageText += `${index + 1}. 📱 *${client.name}* ${sessionEmoji}\n`;
        messageText += `   🔑 \`${client.mac_address}\`\n`;
        if (client.last_used_at) {
          messageText += `   ⏰ ${messages.timeAgo(client.last_used_at)}\n`;
        }
        messageText += '\n';
      });
      messageText += `\n📊 Total: ${clients.length} cliente(s)`;
    }
    
    const buttons = clients.slice(0, 10).map(client => [
      Markup.button.callback(`📱 ${client.name}`, `client:${client.id}:menu`)
    ]);
    buttons.push([Markup.button.callback('🔙 Voltar', 'server:list_clients')]);
    
    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// ========== EDITAR SERVIDOR ==========

async function startEditServer(ctx, serverId) {
  try {
    await ctx.answerCbQuery();
    const server = db.getServerById(parseInt(serverId));
    if (!server) {
      await ctx.editMessageText('❌ Servidor não encontrado');
      return;
    }
    
    ctx.session.serverEdit = { serverId: server.id, step: 'field' };
    
    await ctx.editMessageText(
      `✏️ *Editar Servidor*\n\n${server.color} *${server.name}*\n${server.description ? `📝 ${server.description}\n` : ''}\nQual campo deseja editar?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📝 Nome', `server:edit:${serverId}:name`)],
          [Markup.button.callback('📋 Descrição', `server:edit:${serverId}:description`)],
          [Markup.button.callback('🎨 Cor', `server:edit:${serverId}:color`)],
          [Markup.button.callback('🔙 Cancelar', 'server:list')]
        ])
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function selectEditServerField(ctx, serverId, field) {
  try {
    await ctx.answerCbQuery();
    const server = db.getServerById(parseInt(serverId));
    if (!server) {
      await ctx.editMessageText('❌ Servidor não encontrado');
      return;
    }
    
    ctx.session.serverEdit = { serverId: server.id, step: 'value', field };
    
    if (field === 'color') {
      const colorButtons = SERVER_COLORS.map((color, index) => Markup.button.callback(color, `server:edit_color:${serverId}:${index}`));
      const colorRows = [];
      for (let i = 0; i < colorButtons.length; i += 4) {
        colorRows.push(colorButtons.slice(i, i + 4));
      }
      colorRows.push([Markup.button.callback('🔙 Cancelar', 'server:list')]);
      
      await ctx.editMessageText(`🎨 *Alterar Cor*\n\nServidor: ${server.color} ${server.name}\n\nSelecione a nova cor:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(colorRows)
      });
    } else {
      const fieldNames = { 'name': 'Nome', 'description': 'Descrição' };
      const currentValues = { 'name': server.name, 'description': server.description || '(vazio)' };
      
      await ctx.editMessageText(
        `✏️ *Editar ${fieldNames[field]}*\n\nServidor: ${server.color} ${server.name}\nValor atual: ${currentValues[field]}\n\nDigite o novo valor:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancelar', 'server:list')]])
        }
      );
    }
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function handleEditServerMessage(ctx) {
  const data = ctx.session.serverEdit;
  if (!data || data.step !== 'value') return false;
  
  const text = ctx.message.text.trim();
  
  try {
    const server = db.getServerById(data.serverId);
    if (!server) {
      await ctx.reply('❌ Servidor não encontrado');
      delete ctx.session.serverEdit;
      return true;
    }
    
    if (data.field === 'name') {
      if (text.length < 2 || text.length > 50) {
        await ctx.reply('❌ Nome deve ter entre 2 e 50 caracteres');
        return true;
      }
      const existing = db.getServerByName(text);
      if (existing && existing.id !== data.serverId) {
        await ctx.reply('❌ Já existe um servidor com este nome!');
        return true;
      }
    }
    
    db.updateServer(data.serverId, { [data.field]: text });
    db.logServerAction(data.serverId, 'edit_server', true, `${data.field} atualizado`);
    
    await ctx.reply(messages.successMessage(`${data.field === 'name' ? 'Nome' : 'Descrição'} atualizado!`));
    delete ctx.session.serverEdit;
    setTimeout(() => listServers(ctx), 1000);
  } catch (error) {
    console.error('Erro:', error);
    await ctx.reply(messages.errorMessage('Erro ao atualizar'));
    delete ctx.session.serverEdit;
  }
  return true;
}

async function editServerColor(ctx, serverId, colorIndex) {
  try {
    await ctx.answerCbQuery();
    const server = db.getServerById(parseInt(serverId));
    if (!server) {
      await ctx.editMessageText('❌ Servidor não encontrado');
      return;
    }
    
    const color = SERVER_COLORS[colorIndex] || '🔵';
    db.updateServer(server.id, { color });
    db.logServerAction(server.id, 'edit_server', true, `Cor alterada para ${color}`);
    
    await ctx.editMessageText(messages.successMessage(`Cor alterada para ${color}!`));
    delete ctx.session.serverEdit;
    setTimeout(() => listServers(ctx), 1000);
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// ========== DELETAR SERVIDOR ==========

async function confirmDeleteServer(ctx, serverId) {
  try {
    await ctx.answerCbQuery();
    const server = db.getServerById(parseInt(serverId));
    if (!server) {
      await ctx.editMessageText('❌ Servidor não encontrado');
      return;
    }
    
    const clients = db.getClientsByServer(server.id);
    
    await ctx.editMessageText(
      `🗑️ *Confirmar Exclusão*\n\nServidor: ${server.color} *${server.name}*\n👥 ${clients.length} cliente(s) vinculados\n\n⚠️ Os clientes NÃO serão deletados, apenas ficarão sem servidor.\n\nTem certeza?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Sim, deletar', `server:confirm_delete:${serverId}`)],
          [Markup.button.callback('❌ Cancelar', 'server:list')]
        ])
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function deleteServer(ctx, serverId) {
  try {
    await ctx.answerCbQuery();
    const server = db.getServerById(parseInt(serverId));
    if (!server) {
      await ctx.editMessageText('❌ Servidor não encontrado');
      return;
    }
    
    const serverName = server.name;
    db.deleteServer(server.id);
    
    await ctx.editMessageText(messages.successMessage(`Servidor "${serverName}" removido!`));
    setTimeout(() => listServers(ctx), 1000);
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// ========== TROCAR DOMÍNIO EM MASSA ==========

async function startBulkDomainChange(ctx, serverId) {
  try {
    await ctx.answerCbQuery();
    const server = db.getServerById(parseInt(serverId));
    if (!server) {
      await ctx.editMessageText('❌ Servidor não encontrado');
      return;
    }
    
    const clients = db.getClientsByServer(server.id);
    
    if (clients.length === 0) {
      await ctx.editMessageText('⚠️ Este servidor não tem clientes vinculados.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'server:list')]])
      });
      return;
    }
    
    const byPlayer = {};
    clients.forEach(client => {
      if (!byPlayer[client.player_type]) byPlayer[client.player_type] = [];
      byPlayer[client.player_type].push(client);
    });
    
    const playerNames = { 'iboplayer': 'IBOPlayer', 'ibopro': 'IBOPro', 'vuplayer': 'VU Player' };
    
    let summaryText = `🔄 *Trocar Domínio em Massa*\n\n${server.color} *${server.name}*\n━━━━━━━━━━━━━━━━━━━━\n\n👥 ${clients.length} cliente(s):\n`;
    Object.keys(byPlayer).forEach(playerType => {
      summaryText += `   📱 ${playerNames[playerType]}: ${byPlayer[playerType].length}\n`;
    });
    summaryText += `\n*Escolha o modo de troca:*`;
    
    ctx.session.bulkDomain = {
      serverId: server.id,
      serverName: server.name,
      serverColor: server.color,
      clients,
      step: 'select_mode'
    };
    
    await ctx.editMessageText(summaryText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Trocar TODAS as playlists', `server:bulk_mode:${serverId}:all`)],
        [Markup.button.callback('1️⃣ Trocar apenas a PRIMEIRA', `server:bulk_mode:${serverId}:first`)],
        [Markup.button.callback('🎯 Trocar domínio ESPECÍFICO', `server:bulk_mode:${serverId}:specific`)],
        [Markup.button.callback('🔙 Cancelar', 'server:list')]
      ])
    });
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function selectBulkMode(ctx, serverId, mode) {
  try {
    await ctx.answerCbQuery();
    const data = ctx.session.bulkDomain;
    if (!data) {
      await ctx.editMessageText('❌ Sessão expirada. Tente novamente.');
      return;
    }
    
    data.mode = mode;
    
    const modeDescriptions = {
      [BULK_DOMAIN_MODES.ALL]: '📋 *Modo: Trocar TODAS as playlists*\n\nTodas as playlists de cada cliente terão o domínio alterado.',
      [BULK_DOMAIN_MODES.FIRST]: '1️⃣ *Modo: Trocar apenas a PRIMEIRA*\n\nApenas a primeira playlist de cada cliente será alterada.',
      [BULK_DOMAIN_MODES.SPECIFIC]: '🎯 *Modo: Trocar domínio ESPECÍFICO*\n\nApenas playlists com o domínio antigo especificado serão alteradas.'
    };
    
    if (mode === BULK_DOMAIN_MODES.SPECIFIC) {
      data.step = 'old_domain';
      await ctx.editMessageText(
        `🔄 *Trocar Domínio em Massa*\n\n${data.serverColor} *${data.serverName}*\n━━━━━━━━━━━━━━━━━━━━\n\n${modeDescriptions[mode]}\n\nDigite o *domínio antigo* que será substituído:\n\n💡 _Ex: servidor-antigo.com_`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `server:bulk_domain:${serverId}`)]])
        }
      );
    } else {
      data.step = 'new_domain';
      await ctx.editMessageText(
        `🔄 *Trocar Domínio em Massa*\n\n${data.serverColor} *${data.serverName}*\n━━━━━━━━━━━━━━━━━━━━\n\n${modeDescriptions[mode]}\n\nDigite o *novo domínio*:\n\n💡 _Ex: novo-servidor.com ou servidor.com:8080_`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `server:bulk_domain:${serverId}`)]])
        }
      );
    }
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function handleBulkDomainMessage(ctx) {
  const data = ctx.session.bulkDomain;
  if (!data) return false;
  
  const text = ctx.message.text.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  
  try {
    const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?$/;
    if (!domainRegex.test(text)) {
      await ctx.reply('❌ Domínio inválido!\n\nDigite apenas o domínio (ex: servidor.com ou servidor.com:8080)\nTente novamente:');
      return true;
    }
    
    if (data.step === 'old_domain') {
      data.oldDomain = text;
      data.step = 'new_domain';
      await ctx.reply(
        `✅ Domínio antigo: \`${text}\`\n\nAgora digite o *novo domínio*:\n\n💡 _Ex: novo-servidor.com_`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancelar', 'server:list')]])
        }
      );
    } else if (data.step === 'new_domain') {
      data.newDomain = text;
      data.step = 'confirm';
      
      const modeTexts = {
        [BULK_DOMAIN_MODES.ALL]: '📋 Trocar TODAS as playlists',
        [BULK_DOMAIN_MODES.FIRST]: '1️⃣ Trocar apenas a PRIMEIRA playlist',
        [BULK_DOMAIN_MODES.SPECIFIC]: `🎯 Trocar playlists com domínio: \`${data.oldDomain}\``
      };
      
      let confirmText = `⚠️ *CONFIRMAÇÃO FINAL*\n\n${data.serverColor} *${data.serverName}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      confirmText += `*Modo:* ${modeTexts[data.mode]}\n`;
      if (data.oldDomain) confirmText += `*Domínio antigo:* \`${data.oldDomain}\`\n`;
      confirmText += `*Novo domínio:* \`${text}\`\n`;
      confirmText += `*Clientes afetados:* ${data.clients.length}\n\n`;
      confirmText += `⚠️ Esta ação irá:\n• Fazer login em cada cliente\n• Listar todas as playlists\n• Alterar o domínio conforme o modo selecionado\n\n*Tem certeza que deseja continuar?*`;
      
      await ctx.reply(confirmText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Sim, executar', 'server:bulk_execute')],
          [Markup.button.callback('❌ Cancelar', 'server:bulk_cancel')]
        ])
      });
    }
  } catch (error) {
    console.error('Erro:', error);
    await ctx.reply(messages.errorMessage('Erro ao processar'));
    delete ctx.session.bulkDomain;
  }
  return true;
}

async function executeBulkDomainChange(ctx) {
  try {
    await ctx.answerCbQuery('Iniciando...');
    const data = ctx.session.bulkDomain;
    if (!data || !data.newDomain) {
      await ctx.editMessageText('❌ Sessão expirada. Tente novamente.');
      return;
    }
    
    const { clients, newDomain, oldDomain, serverId, serverName, serverColor, mode } = data;
    
    const modeTexts = {
      [BULK_DOMAIN_MODES.ALL]: 'TODAS as playlists',
      [BULK_DOMAIN_MODES.FIRST]: 'apenas a PRIMEIRA',
      [BULK_DOMAIN_MODES.SPECIFIC]: `domínio ${oldDomain}`
    };
    
    await ctx.editMessageText(
      `🔄 *Executando troca de domínio...*\n\n${serverColor} ${serverName}\n📋 Modo: ${modeTexts[mode]}\n🌐 Novo: \`${newDomain}\`\n\n⏳ Processando 0/${clients.length} clientes...`,
      { parse_mode: 'Markdown' }
    );
    
    const results = { success: 0, failed: 0, skipped: 0, playlistsChanged: 0, errors: [] };
    
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      
      try {
        if (i % 3 === 0) {
          await ctx.editMessageText(
            `🔄 *Executando troca de domínio...*\n\n${serverColor} ${serverName}\n📋 Modo: ${modeTexts[mode]}\n🌐 Novo: \`${newDomain}\`\n\n⏳ Processando ${i + 1}/${clients.length} clientes...\n✅ ${results.success} | ❌ ${results.failed} | ⏭️ ${results.skipped}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
        
        const playerServices = {
          'iboplayer': require('../services/iboplayer'),
          'ibopro': require('../services/ibopro'),
          'vuplayer': require('../services/vuplayer')
        };
        
        const service = playerServices[client.player_type];
        if (!service) {
          results.failed++;
          results.errors.push(`${client.name}: Player não suportado`);
          continue;
        }
        
        const session = await sessionManager.getValidSession(client, service.login);
        const playlists = await service.listPlaylists(session.sessionData);
        
        if (playlists.length === 0) {
          results.skipped++;
          continue;
        }
        
        let playlistsToProcess = [];
        switch (mode) {
          case BULK_DOMAIN_MODES.ALL:
            playlistsToProcess = playlists;
            break;
          case BULK_DOMAIN_MODES.FIRST:
            playlistsToProcess = [playlists[0]];
            break;
          case BULK_DOMAIN_MODES.SPECIFIC:
            playlistsToProcess = playlists.filter(p => {
              const urlMatch = p.url.match(/^(https?:\/\/)?([^\/\?]+)/);
              const playlistDomain = urlMatch ? urlMatch[2].toLowerCase() : null;
              return playlistDomain && playlistDomain.includes(oldDomain.toLowerCase());
            });
            break;
        }
        
        if (playlistsToProcess.length === 0) {
          results.skipped++;
          continue;
        }
        
        let clientChanged = false;
        for (const playlist of playlistsToProcess) {
          try {
            const oldUrl = playlist.url;
            const urlMatch = oldUrl.match(/^(https?:\/\/)?([^\/\?]+)/);
            const currentDomain = urlMatch ? urlMatch[2] : null;
            if (!currentDomain) continue;
            
            const protocolMatch = oldUrl.match(/^(https?):\/\//);
            const protocol = protocolMatch ? protocolMatch[1] : 'http';
            
            const newUrl = oldUrl.replace(
              new RegExp(`^https?:\/\/${currentDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
              `${protocol}://${newDomain}`
            );
            
            if (newUrl !== oldUrl) {
              await service.editPlaylist(session.sessionData, playlist.id, {
                name: playlist.name,
                url: newUrl,
                protect: playlist.is_protected,
                pin: playlist.pin || '',
                type: playlist.type || 'general'
              });
              results.playlistsChanged++;
              clientChanged = true;
            }
          } catch (playlistError) {
            console.error(`Erro na playlist ${playlist.name}:`, playlistError.message);
          }
        }
        
        if (clientChanged) {
          results.success++;
          db.logAction(client.id, 'bulk_domain_change', true, `Domínio alterado para ${newDomain}`, serverId);
        } else {
          results.skipped++;
        }
      } catch (clientError) {
        console.error(`Erro no cliente ${client.name}:`, clientError.message);
        results.failed++;
        results.errors.push(`${client.name}: ${clientError.message}`);
        db.logAction(client.id, 'bulk_domain_change', false, clientError.message, serverId);
      }
    }
    
    let resultText = `✅ *Troca de Domínio Concluída!*\n\n${serverColor} ${serverName}\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    resultText += `📋 *Modo:* ${modeTexts[mode]}\n`;
    if (oldDomain) resultText += `🔄 *De:* \`${oldDomain}\`\n`;
    resultText += `🌐 *Para:* \`${newDomain}\`\n\n`;
    resultText += `📊 *Resultado:*\n✅ Clientes alterados: ${results.success}\n❌ Clientes com falha: ${results.failed}\n⏭️ Clientes pulados: ${results.skipped}\n📺 Playlists alteradas: ${results.playlistsChanged}\n`;
    
    if (results.errors.length > 0) {
      resultText += `\n⚠️ *Erros:*\n`;
      results.errors.slice(0, 5).forEach(err => { resultText += `• ${err}\n`; });
      if (results.errors.length > 5) resultText += `... e mais ${results.errors.length - 5} erro(s)\n`;
    }
    
    db.logServerAction(serverId, 'bulk_domain_change', true, `Modo: ${mode} | ${results.success} clientes, ${results.playlistsChanged} playlists → ${newDomain}`);
    
    await ctx.editMessageText(resultText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar aos Servidores', 'server:list')]])
    });
    
    delete ctx.session.bulkDomain;
  } catch (error) {
    console.error('Erro na execução em massa:', error);
    await ctx.editMessageText(messages.errorMessage(`Erro: ${error.message}`));
    delete ctx.session.bulkDomain;
  }
}

async function cancelBulkDomain(ctx) {
  await ctx.answerCbQuery('Cancelado');
  delete ctx.session.bulkDomain;
  await listServers(ctx);
}

// ========== ATRIBUIR SERVIDOR A CLIENTE ==========

async function showServerSelectionForClient(ctx, clientId) {
  try {
    await ctx.answerCbQuery();
    const client = db.getClientById(clientId);
    if (!client) {
      await ctx.editMessageText('❌ Cliente não encontrado');
      return;
    }
    
    const servers = db.getAllServers();
    const buttons = servers.map(server => [
      Markup.button.callback(`${server.color} ${server.name}`, `client:${clientId}:server:${server.id}`)
    ]);
    
    if (client.server_id) {
      buttons.push([Markup.button.callback('⚪ Remover do Servidor', `client:${clientId}:server:none`)]);
    }
    buttons.push([Markup.button.callback('🔙 Cancelar', `client:${clientId}:menu`)]);
    
    let messageText = `🗂️ *Atribuir Servidor*\n\n📱 Cliente: *${client.name}*\n`;
    messageText += client.server_name ? `📍 Servidor atual: ${client.server_color} ${client.server_name}\n` : `📍 Servidor atual: ⚪ Nenhum\n`;
    messageText += `\nSelecione o novo servidor:`;
    
    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

async function assignServerToClient(ctx, clientId, serverId) {
  try {
    await ctx.answerCbQuery();
    const client = db.getClientById(clientId);
    if (!client) {
      await ctx.editMessageText('❌ Cliente não encontrado');
      return;
    }
    
    if (serverId === 'none') {
      db.updateClientServer(clientId, null);
      await ctx.editMessageText(messages.successMessage(`Cliente "${client.name}" removido do servidor!`));
    } else {
      const server = db.getServerById(parseInt(serverId));
      if (!server) {
        await ctx.editMessageText('❌ Servidor não encontrado');
        return;
      }
      db.updateClientServer(clientId, server.id);
      db.logAction(clientId, 'assign_server', true, `Atribuído ao servidor "${server.name}"`);
      await ctx.editMessageText(messages.successMessage(`Cliente "${client.name}" atribuído ao servidor ${server.color} ${server.name}!`));
    }
    
    setTimeout(async () => {
      const { showClientMenu } = require('./clientManage');
      const updatedClient = db.getClientById(clientId);
      await showClientMenu(ctx, updatedClient);
    }, 1500);
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

module.exports = {
  listServers,
  startAddServer,
  handleAddServerMessage,
  skipServerDescription,
  selectServerColor,
  listServerSelection,
  viewServerClients,
  startEditServer,
  selectEditServerField,
  handleEditServerMessage,
  editServerColor,
  confirmDeleteServer,
  deleteServer,
  startBulkDomainChange,
  selectBulkMode,
  handleBulkDomainMessage,
  executeBulkDomainChange,
  cancelBulkDomain,
  showServerSelectionForClient,
  assignServerToClient,
  SERVER_COLORS,
  BULK_DOMAIN_MODES
};