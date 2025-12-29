// handlers/domainManage.js - Gerenciamento de domínios pré-cadastrados
const { Markup } = require('telegraf');
const db = require('../database/db');
const messages = require('../utils/messages');

// Listar domínios
async function listDomains(ctx) {
  try {
    const domains = db.getAllDomains(true);
    
    let messageText = '📋 *Domínios Cadastrados*\n';
    messageText += '━━━━━━━━━━━━━━━━━━━━\n\n';
    
    if (domains.length === 0) {
      messageText += '⚠️ Nenhum domínio cadastrado.\n\n';
      messageText += 'Use "➕ Adicionar Domínio" para cadastrar.';
    } else {
      domains.forEach((domain, index) => {
        messageText += `${index + 1}. ${domain.domain}\n`;
        if (domain.description) {
          messageText += `   📝 ${domain.description}\n`;
        }
        messageText += '\n';
      });
    }
    
    const buttons = [[Markup.button.callback('➕ Adicionar Domínio', 'domains:add')]];
    
    if (domains.length > 0) {
      buttons.push([Markup.button.callback('🗑️ Remover Domínio', 'domains:select_delete')]);
    }
    
    buttons.push([Markup.button.callback('🔙 Voltar', 'settings:menu')]);
    
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
    console.error('Erro ao listar domínios:', error);
    await ctx.reply(messages.errorMessage('Erro ao listar domínios'));
  }
}

// Iniciar adição de domínio
async function startAddDomain(ctx) {
  try {
    await ctx.answerCbQuery();
    
    ctx.session.domainAdd = {
      step: 'domain'
    };
    
    await ctx.editMessageText(
      '➕ *Adicionar Domínio*\n\n' +
      'Digite o domínio (ex: iboplayer.com):\n\n' +
      '💡 *Dica:* Digite apenas o domínio, sem http:// ou https://',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Cancelar', 'domains:list')]
        ])
      }
    );
    
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Processar mensagem de adicionar domínio
async function handleAddDomainMessage(ctx) {
  const data = ctx.session.domainAdd;
  if (!data) return false;
  
  const text = ctx.message.text.trim();
  
  try {
    if (data.step === 'domain') {
      // Validar domínio
      const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
      const cleanDomain = text.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      
      if (!domainRegex.test(cleanDomain)) {
        await ctx.reply('❌ Domínio inválido! Digite apenas o domínio (ex: iboplayer.com)');
        return true;
      }
      
      // Verificar se já existe
      const existing = db.getAllDomains().find(d => d.domain === cleanDomain);
      if (existing) {
        await ctx.reply('❌ Este domínio já está cadastrado!');
        return true;
      }
      
      // Perguntar descrição (opcional)
      ctx.session.domainAdd = {
        step: 'description',
        domain: cleanDomain
      };
      
      await ctx.reply(
        '📝 *Descrição (opcional)*\n\n' +
        `Domínio: \`${cleanDomain}\`\n\n` +
        'Digite uma descrição para este domínio ou envie "pular" para continuar sem descrição:',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⏭️ Pular', 'domains:skip_description')]
          ])
        }
      );
      
    } else if (data.step === 'description') {
      const description = text.toLowerCase() === 'pular' ? null : text;
      
      // Salvar no banco
      db.createDomain(data.domain, description);
      
      await ctx.reply(messages.successMessage(`Domínio "${data.domain}" cadastrado com sucesso!`));
      
      delete ctx.session.domainAdd;
      
      // Voltar à lista
      setTimeout(() => listDomains(ctx), 1000);
    }
    
  } catch (error) {
    console.error('Erro ao adicionar domínio:', error);
    await ctx.reply(messages.errorMessage('Erro ao adicionar domínio'));
    delete ctx.session.domainAdd;
  }
  
  return true;
}

// Pular descrição
async function skipDescription(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const data = ctx.session.domainAdd;
    if (!data || !data.domain) {
      await ctx.reply('❌ Erro: domínio não encontrado');
      return;
    }
    
    // Salvar sem descrição
    db.createDomain(data.domain, null);
    
    await ctx.editMessageText(messages.successMessage(`Domínio "${data.domain}" cadastrado!`));
    
    delete ctx.session.domainAdd;
    
    setTimeout(() => listDomains(ctx), 1000);
    
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Selecionar domínio para deletar
async function selectDeleteDomain(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const domains = db.getAllDomains();
    
    const buttons = domains.map(domain => [
      Markup.button.callback(
        `🗑️ ${domain.domain}`,
        `domains:confirm_delete:${domain.id}`
      )
    ]);
    
    buttons.push([Markup.button.callback('🔙 Cancelar', 'domains:list')]);
    
    await ctx.editMessageText(
      '🗑️ *Remover Domínio*\n\n' +
      'Selecione o domínio que deseja remover:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
    
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Confirmar deleção
async function confirmDeleteDomain(ctx, domainId) {
  try {
    await ctx.answerCbQuery();
    
    const domain = db.getDomainById(domainId);
    if (!domain) {
      await ctx.reply('❌ Domínio não encontrado');
      return;
    }
    
    await ctx.editMessageText(
      `🗑️ *Confirmar Remoção*\n\n` +
      `Tem certeza que deseja remover o domínio:\n` +
      `\`${domain.domain}\`\n\n` +
      `⚠️ Esta ação não pode ser desfeita!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Sim, Remover', `domains:delete:${domainId}`)],
          [Markup.button.callback('❌ Cancelar', 'domains:list')]
        ])
      }
    );
    
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

// Deletar domínio
async function deleteDomain(ctx, domainId) {
  try {
    await ctx.answerCbQuery();
    
    const domain = db.getDomainById(domainId);
    if (!domain) {
      await ctx.reply('❌ Domínio não encontrado');
      return;
    }
    
    db.deleteDomain(domainId);
    
    await ctx.editMessageText(messages.successMessage(`Domínio "${domain.domain}" removido!`));
    
    setTimeout(() => listDomains(ctx), 1000);
    
  } catch (error) {
    console.error('Erro:', error);
    await ctx.answerCbQuery('❌ Erro');
  }
}

module.exports = {
  listDomains,
  startAddDomain,
  handleAddDomainMessage,
  skipDescription,
  selectDeleteDomain,
  confirmDeleteDomain,
  deleteDomain
};
