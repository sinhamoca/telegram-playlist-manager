// database/migrate-servers.js - Migração para adicionar suporte a servidores
// Execute: node database/migrate-servers.js

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'iptv.db');

console.log('🔄 Iniciando migração para adicionar suporte a servidores...');
console.log(`📁 Banco de dados: ${DB_PATH}`);

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // Verificar se a tabela servers já existe
  const serversExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='servers'
  `).get();
  
  if (serversExists) {
    console.log('✅ Tabela servers já existe');
  } else {
    console.log('📝 Criando tabela servers...');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        color TEXT DEFAULT '🔵',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_servers_active ON servers(is_active);
      CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name COLLATE NOCASE);
      
      CREATE TRIGGER IF NOT EXISTS update_servers_timestamp 
      AFTER UPDATE ON servers
      BEGIN
        UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
    
    console.log('✅ Tabela servers criada');
  }
  
  // Verificar se a coluna server_id já existe na tabela clients
  const clientsInfo = db.prepare('PRAGMA table_info(clients)').all();
  const hasServerId = clientsInfo.some(col => col.name === 'server_id');
  
  if (hasServerId) {
    console.log('✅ Coluna server_id já existe em clients');
  } else {
    console.log('📝 Adicionando coluna server_id em clients...');
    
    db.exec(`
      ALTER TABLE clients ADD COLUMN server_id INTEGER DEFAULT NULL 
      REFERENCES servers(id) ON DELETE SET NULL;
      
      CREATE INDEX IF NOT EXISTS idx_clients_server ON clients(server_id);
    `);
    
    console.log('✅ Coluna server_id adicionada');
  }
  
  // Verificar se a coluna server_id já existe na tabela action_logs
  const logsInfo = db.prepare('PRAGMA table_info(action_logs)').all();
  const logsHasServerId = logsInfo.some(col => col.name === 'server_id');
  
  if (logsHasServerId) {
    console.log('✅ Coluna server_id já existe em action_logs');
  } else {
    console.log('📝 Adicionando coluna server_id em action_logs...');
    
    db.exec(`
      ALTER TABLE action_logs ADD COLUMN server_id INTEGER DEFAULT NULL
      REFERENCES servers(id) ON DELETE SET NULL;
      
      CREATE INDEX IF NOT EXISTS idx_logs_server ON action_logs(server_id);
    `);
    
    console.log('✅ Coluna server_id adicionada em action_logs');
  }
  
  // Estatísticas finais
  const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const totalServers = db.prepare('SELECT COUNT(*) as count FROM servers').get().count;
  
  console.log('\n📊 Estatísticas:');
  console.log(`   👥 Clientes: ${totalClients}`);
  console.log(`   🗂️ Servidores: ${totalServers}`);
  
  db.close();
  
  console.log('\n✅ Migração concluída com sucesso!');
  
} catch (error) {
  console.error('❌ Erro na migração:', error);
  process.exit(1);
}
