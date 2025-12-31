# 🤖 Telegram IPTV Bot

Bot do Telegram para gerenciar clientes IPTV dos aplicativos **IBOPlayer**, **IBOPro** e **VU Player Pro**.

## ✨ Funcionalidades

- ⚡ **Gestão Rápida**: Cadastre e gerencie clientes em poucos passos
- 🔍 **Busca Inteligente**: Encontre clientes por nome ou MAC
- 📋 **Gerenciamento de Playlists**: Adicionar, editar e deletar playlists
- 💾 **Cache de Sessões**: Login automático reutiliza sessões válidas
- 📊 **Estatísticas**: Acompanhe uso e atividade
- 🔐 **Seguro**: Apenas você tem acesso (autenticação por Telegram ID)

## 📦 Instalação

### 1. Clonar/Copiar projeto

```bash
cd telegram-iptv-bot
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

**Configure obrigatoriamente:**

```env
# Token do seu bot (obtenha com @BotFather)
TELEGRAM_BOT_TOKEN=seu-token-aqui

# Seu Telegram User ID (descubra com @userinfobot)
ADMIN_TELEGRAM_ID=seu-user-id

# URL do Cloudflare Worker (para VU Player)
CLOUDFLARE_WORKER_URL=https://seu-worker.workers.dev
```

### 4. Criar o bot no Telegram

1. Acesse [@BotFather](https://t.me/BotFather)
2. Digite `/newbot`
3. Escolha um nome e username
4. Copie o **token** e cole no `.env`

### 5. Descobrir seu Telegram ID

1. Acesse [@userinfobot](https://t.me/userinfobot)
2. Digite `/start`
3. Copie o **ID** e cole no `.env`

### 6. Iniciar o bot

```bash
npm start
```

Ou com auto-reload durante desenvolvimento:

```bash
npm run dev
```

## 🚀 Como Usar

### Menu Principal

Após enviar `/start` para o bot:

```
🔍 Buscar Cliente     - Buscar por nome ou MAC
⚡ Gestão Rápida      - Cadastro + gerenciar rapidamente
➕ Novo Cliente       - Cadastro completo
📊 Listar Todos       - Ver todos os clientes
⚙️ Configurações     - Limpar sessões, ver logs
📈 Estatísticas      - Métricas do sistema
```

### ⚡ Gestão Rápida (Recomendado!)

Fluxo mais rápido para começar a gerenciar:

1. Clique em **"⚡ Gestão Rápida"**
2. Envie o **MAC Address** do cliente
3. Envie o **Device Key** (ou password)
4. Escolha o **aplicativo** (IBOPlayer/IBOPro/VU Player)
5. Se IBOPlayer: informe o **domínio**
6. Digite o **nome do cliente**
7. ✅ Pronto! Já pode gerenciar as playlists

### 📋 Gerenciar Playlists

No menu do cliente:

- **📋 Ver Playlists**: Lista todas as playlists do cliente
- **➕ Adicionar**: Cadastrar nova playlist
  - Nome da playlist
  - URL (http:// ou https://)
  - Proteção com PIN (opcional)
  - Tipo (Geral, Filmes, Séries)
- **✏️ Editar**: Modificar playlist existente
- **🗑️ Deletar**: Remover playlist

### 🔍 Buscar Cliente

- Digite nome completo ou parcial
- Digite MAC completo ou parcial
- Ex: "João", "maria", "00:1A", "79:XX"

## 💾 Cache de Sessões

O bot **economiza tempo** reutilizando sessões:

- ✅ Primeiro acesso: Faz login completo
- ✅ Acessos seguintes: Usa sessão em cache (instantâneo!)
- ✅ Validade: 3 dias (IBOPlayer/VU Player), 7 dias (IBOPro)
- ✅ Renovação automática quando expira

**Limpeza:**
- Automática: A cada 6 horas
- Manual: `/clean` ou menu Configurações

## 🗂️ Estrutura do Projeto

```
telegram-iptv-bot/
├── bot.js                  # Bot principal
├── index.js                # Inicialização
├── config.js               # Configurações
├── package.json
├── .env                    # Suas configurações (não commitar!)
├── .env.example            # Template de configuração
├── database/
│   ├── db.js              # Operações SQLite
│   ├── schema.sql         # Estrutura do banco
│   └── iptv.db            # Banco de dados (criado automaticamente)
├── services/
│   ├── sessionManager.js  # Gerenciador de cache
│   ├── iboplayer.js       # Integração IBOPlayer
│   ├── ibopro.js          # Integração IBOPro
│   └── vuplayer.js        # Integração VU Player
├── handlers/
│   ├── quickManage.js     # Gestão rápida
│   ├── clientManage.js    # Gerenciar clientes
│   └── search.js          # Busca de clientes
├── utils/
│   ├── keyboards.js       # Teclados do Telegram
│   └── messages.js        # Formatação de mensagens
└── sessions/              # Cache de sessões (auto-criado)
```

## ⚙️ Configurações Avançadas

Todas em `.env`:

```env
# Expiração das sessões (em horas)
SESSION_EXPIRY_IBOPLAYER=72      # 3 dias
SESSION_EXPIRY_IBOPRO=168        # 7 dias
SESSION_EXPIRY_VUPLAYER=72       # 3 dias

# OCR.space (para IBOPlayer)
OCR_API_KEY=K83817685188957      # Sua key
MAX_CAPTCHA_ATTEMPTS=15          # Tentativas

# VU Player
CLOUDFLARE_WORKER_URL=https://...
USE_CLOUDFLARE_WORKER=true
VUPLAYER_DOMAIN=vuproplayer.org

# IBOPro
IBOPRO_API_BASE=api.iboproapp.com

# Banco de dados
DATABASE_PATH=./database/iptv.db
```

## 🔧 Comandos Disponíveis

```bash
npm start         # Iniciar bot
npm run dev       # Modo desenvolvimento (nodemon)
npm run db:init   # Recriar banco de dados
```

**Comandos do bot:**
- `/start` - Menu principal
- `/help` - Ajuda
- `/stats` - Estatísticas
- `/clean` - Limpar sessões expiradas

## 🐛 Troubleshooting

### Bot não inicia

- ✅ Verifique se `TELEGRAM_BOT_TOKEN` está correto
- ✅ Verifique se `ADMIN_TELEGRAM_ID` está correto
- ✅ Certifique-se que `.env` existe

### "Acesso negado"

- ✅ Seu Telegram ID está correto no `.env`?
- ✅ Use [@userinfobot](https://t.me/userinfobot) para confirmar

### VU Player não funciona

- ✅ Configure `CLOUDFLARE_WORKER_URL` no `.env`
- ✅ Certifique-se que o Worker está ativo

### IBOPlayer falha no login

- ✅ Verifique se `OCR_API_KEY` está válida
- ✅ Tente aumentar `MAX_CAPTCHA_ATTEMPTS`
- ✅ Teste credenciais manualmente primeiro

### Sessão expirada frequentemente

- ✅ Aumente valores em `SESSION_EXPIRY_*`
- ✅ Use `/clean` para limpar cache

## 📊 Logs e Monitoramento

Visualizar atividade:
- Menu → **⚙️ Configurações** → **📊 Ver Logs**
- Ou comando `/stats`

## 🔒 Segurança

- ✅ Apenas seu Telegram ID tem acesso
- ✅ Senhas nunca são logadas
- ✅ Sessões em cache são locais
- ✅ `.gitignore` protege dados sensíveis

## 📝 Notas Importantes

- **Backup**: Faça backup regular de `database/iptv.db`
- **Sessões**: Arquivos em `sessions/` são temporários
- **API Key**: OCR.space gratuito tem limite de 25k req/mês
- **Worker**: VU Player requer Cloudflare Worker ativo

## 🚀 Melhorias Futuras (Roadmap)

- [ ] Multi-usuário (vários revendedores)
- [ ] Renovações automáticas de playlists
- [ ] Notificações de expiração
- [ ] Dashboard web (opcional)
- [ ] Export/Import de clientes
- [ ] Relatórios detalhados

## 📄 Licença

MIT

## 👨‍💻 Autor

Isaac

---

**Dúvidas?** Abra uma issue ou entre em contato!
