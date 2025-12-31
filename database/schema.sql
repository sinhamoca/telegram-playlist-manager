-- Schema do banco de dados SQLite

-- Tabela de servidores (grupos de clientes)
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '🔵',
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índice para servidores
CREATE INDEX IF NOT EXISTS idx_servers_active ON servers(is_active);
CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name COLLATE NOCASE);

-- Trigger para atualizar updated_at de servidores
CREATE TRIGGER IF NOT EXISTS update_servers_timestamp 
AFTER UPDATE ON servers
BEGIN
  UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  player_type TEXT NOT NULL CHECK(player_type IN ('iboplayer', 'ibopro', 'vuplayer')),
  mac_address TEXT NOT NULL UNIQUE,
  device_key TEXT,
  password TEXT,
  domain TEXT,
  server_id INTEGER DEFAULT NULL,
  
  -- Controle de sessão
  has_active_session BOOLEAN DEFAULT 0,
  session_expires_at DATETIME,
  last_login_at DATETIME,
  last_used_at DATETIME,
  
  -- Metadados
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_clients_mac ON clients(mac_address);
CREATE INDEX IF NOT EXISTS idx_clients_player_type ON clients(player_type);
CREATE INDEX IF NOT EXISTS idx_clients_server ON clients(server_id);

-- Tabela de logs de ações
CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  server_id INTEGER,
  action TEXT NOT NULL,
  success BOOLEAN DEFAULT 1,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
);

-- Índice para logs
CREATE INDEX IF NOT EXISTS idx_logs_client ON action_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_logs_server ON action_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON action_logs(created_at DESC);

-- Tabela de domínios pré-cadastrados (para IBOPlayer)
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índice para domínios
CREATE INDEX IF NOT EXISTS idx_domains_active ON domains(is_active);

-- Trigger para atualizar updated_at de domínios
CREATE TRIGGER IF NOT EXISTS update_domains_timestamp 
AFTER UPDATE ON domains
BEGIN
  UPDATE domains SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger para atualizar updated_at
CREATE TRIGGER IF NOT EXISTS update_clients_timestamp 
AFTER UPDATE ON clients
BEGIN
  UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;