// database/db.js - Conexão e operações com SQLite
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'iptv.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Criar conexão com banco
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Performance

// Inicializar schema se não existir
function initDatabase() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  console.log('✅ Banco de dados inicializado');
}

// ========== CLIENTES ==========

function createClient(client) {
  const stmt = db.prepare(`
    INSERT INTO clients (name, player_type, mac_address, device_key, password, domain)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    client.name,
    client.playerType,
    client.macAddress,
    client.deviceKey || null,
    client.password || null,
    client.domain || null
  );
  
  return result.lastInsertRowid;
}

function getClientById(id) {
  const stmt = db.prepare('SELECT * FROM clients WHERE id = ?');
  return stmt.get(id);
}

function getClientByMac(macAddress) {
  const stmt = db.prepare('SELECT * FROM clients WHERE mac_address = ?');
  return stmt.get(macAddress);
}

function searchClients(query) {
  const stmt = db.prepare(`
    SELECT * FROM clients 
    WHERE name LIKE ? OR mac_address LIKE ?
    ORDER BY last_used_at DESC NULLS LAST, created_at DESC
    LIMIT 20
  `);
  
  const searchTerm = `%${query}%`;
  return stmt.all(searchTerm, searchTerm);
}

function getAllClients() {
  const stmt = db.prepare(`
    SELECT * FROM clients 
    ORDER BY last_used_at DESC NULLS LAST, created_at DESC
  `);
  return stmt.all();
}

function updateClient(id, updates) {
  const fields = [];
  const values = [];
  
  Object.keys(updates).forEach(key => {
    fields.push(`${key} = ?`);
    values.push(updates[key]);
  });
  
  if (fields.length === 0) return;
  
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE clients 
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  
  return stmt.run(...values);
}

function deleteClient(id) {
  const stmt = db.prepare('DELETE FROM clients WHERE id = ?');
  return stmt.run(id);
}

function updateSessionStatus(id, hasSession, expiresAt = null) {
  const stmt = db.prepare(`
    UPDATE clients 
    SET has_active_session = ?,
        session_expires_at = ?,
        last_login_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  return stmt.run(hasSession ? 1 : 0, expiresAt, id);
}

function updateLastUsed(id) {
  const stmt = db.prepare(`
    UPDATE clients 
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  return stmt.run(id);
}

// ========== LOGS ==========

function logAction(clientId, action, success = true, details = null) {
  const stmt = db.prepare(`
    INSERT INTO action_logs (client_id, action, success, details)
    VALUES (?, ?, ?, ?)
  `);
  
  return stmt.run(clientId, action, success ? 1 : 0, details);
}

function getClientLogs(clientId, limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM action_logs 
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(clientId, limit);
}

function getRecentLogs(limit = 100) {
  const stmt = db.prepare(`
    SELECT l.*, c.name as client_name 
    FROM action_logs l
    LEFT JOIN clients c ON l.client_id = c.id
    ORDER BY l.created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(limit);
}

// ========== ESTATÍSTICAS ==========

function getStats() {
  const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const activeSessions = db.prepare('SELECT COUNT(*) as count FROM clients WHERE has_active_session = 1').get().count;
  
  const byPlayer = db.prepare(`
    SELECT player_type, COUNT(*) as count 
    FROM clients 
    GROUP BY player_type
  `).all();
  
  const recentActivity = db.prepare(`
    SELECT COUNT(*) as count 
    FROM action_logs 
    WHERE created_at >= datetime('now', '-24 hours')
  `).get().count;
  
  return {
    totalClients,
    activeSessions,
    byPlayer,
    recentActivity
  };
}

module.exports = {
  db,
  initDatabase,
  
  // Clientes
  createClient,
  getClientById,
  getClientByMac,
  searchClients,
  getAllClients,
  updateClient,
  deleteClient,
  updateSessionStatus,
  updateLastUsed,
  
  // Logs
  logAction,
  getClientLogs,
  getRecentLogs,
  
  // Stats
  getStats
};

// ========== DOMÍNIOS PRÉ-CADASTRADOS ==========

function createDomain(domain, description = null) {
  const stmt = db.prepare(`
    INSERT INTO domains (domain, description)
    VALUES (?, ?)
  `);
  
  const result = stmt.run(domain.trim().toLowerCase(), description);
  return result.lastInsertRowid;
}

function getAllDomains(onlyActive = true) {
  const query = onlyActive 
    ? `SELECT * FROM domains WHERE is_active = 1 ORDER BY domain ASC`
    : `SELECT * FROM domains ORDER BY domain ASC`;
  
  return db.prepare(query).all();
}

function getDomainById(id) {
  return db.prepare('SELECT * FROM domains WHERE id = ?').get(id);
}

function updateDomain(id, updates) {
  const allowedFields = ['domain', 'description', 'is_active'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
  
  if (fields.length === 0) return;
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  
  const stmt = db.prepare(`UPDATE domains SET ${setClause} WHERE id = ?`);
  stmt.run(...values, id);
}

function deleteDomain(id) {
  db.prepare('DELETE FROM domains WHERE id = ?').run(id);
}

module.exports = {
  db,
  initDatabase,
  
  // Clientes
  createClient,
  getClientById,
  getClientByMac,
  searchClients,
  getAllClients,
  updateClient,
  deleteClient,
  updateSessionStatus,
  updateLastUsed,
  
  // Logs
  logAction,
  getClientLogs,
  getRecentLogs,
  
  // Stats
  getStats,
  
  // Domínios
  createDomain,
  getAllDomains,
  getDomainById,
  updateDomain,
  deleteDomain
};