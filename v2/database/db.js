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

// ========== SERVIDORES ==========

function createServer(name, description = null, color = '🔵') {
  const stmt = db.prepare(`
    INSERT INTO servers (name, description, color)
    VALUES (?, ?, ?)
  `);
  
  const result = stmt.run(name.trim(), description, color);
  return result.lastInsertRowid;
}

function getServerById(id) {
  const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
  return stmt.get(id);
}

function getServerByName(name) {
  const stmt = db.prepare('SELECT * FROM servers WHERE name = ? COLLATE NOCASE');
  return stmt.get(name);
}

function getAllServers(onlyActive = true) {
  const query = onlyActive 
    ? `SELECT * FROM servers WHERE is_active = 1 ORDER BY name ASC`
    : `SELECT * FROM servers ORDER BY name ASC`;
  
  return db.prepare(query).all();
}

function getServersWithClientCount() {
  const stmt = db.prepare(`
    SELECT s.*, COUNT(c.id) as client_count
    FROM servers s
    LEFT JOIN clients c ON c.server_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    ORDER BY s.name ASC
  `);
  
  return stmt.all();
}

function updateServer(id, updates) {
  const allowedFields = ['name', 'description', 'color', 'is_active'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
  
  if (fields.length === 0) return;
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  
  const stmt = db.prepare(`UPDATE servers SET ${setClause} WHERE id = ?`);
  stmt.run(...values, id);
}

function deleteServer(id) {
  // Clientes com este server_id terão server_id = NULL (ON DELETE SET NULL)
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}

// ========== CLIENTES ==========

function createClient(client) {
  const stmt = db.prepare(`
    INSERT INTO clients (name, player_type, mac_address, device_key, password, domain, server_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    client.name,
    client.playerType,
    client.macAddress,
    client.deviceKey || null,
    client.password || null,
    client.domain || null,
    client.serverId || null
  );
  
  return result.lastInsertRowid;
}

function getClientById(id) {
  const stmt = db.prepare(`
    SELECT c.*, s.name as server_name, s.color as server_color
    FROM clients c
    LEFT JOIN servers s ON c.server_id = s.id
    WHERE c.id = ?
  `);
  return stmt.get(id);
}

function getClientByMac(macAddress) {
  const stmt = db.prepare(`
    SELECT c.*, s.name as server_name, s.color as server_color
    FROM clients c
    LEFT JOIN servers s ON c.server_id = s.id
    WHERE c.mac_address = ?
  `);
  return stmt.get(macAddress);
}

function searchClients(query) {
  const stmt = db.prepare(`
    SELECT c.*, s.name as server_name, s.color as server_color
    FROM clients c
    LEFT JOIN servers s ON c.server_id = s.id
    WHERE c.name LIKE ? OR c.mac_address LIKE ?
    ORDER BY c.last_used_at DESC NULLS LAST, c.created_at DESC
    LIMIT 20
  `);
  
  const searchTerm = `%${query}%`;
  return stmt.all(searchTerm, searchTerm);
}

function getAllClients() {
  const stmt = db.prepare(`
    SELECT c.*, s.name as server_name, s.color as server_color
    FROM clients c
    LEFT JOIN servers s ON c.server_id = s.id
    ORDER BY c.last_used_at DESC NULLS LAST, c.created_at DESC
  `);
  return stmt.all();
}

function getClientsByServer(serverId) {
  const stmt = db.prepare(`
    SELECT c.*, s.name as server_name, s.color as server_color
    FROM clients c
    LEFT JOIN servers s ON c.server_id = s.id
    WHERE c.server_id = ?
    ORDER BY c.name ASC
  `);
  return stmt.all(serverId);
}

function getClientsWithoutServer() {
  const stmt = db.prepare(`
    SELECT c.*
    FROM clients c
    WHERE c.server_id IS NULL
    ORDER BY c.name ASC
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

function updateClientServer(clientId, serverId) {
  const stmt = db.prepare(`
    UPDATE clients 
    SET server_id = ?
    WHERE id = ?
  `);
  
  return stmt.run(serverId, clientId);
}

function updateClientsServerBulk(clientIds, serverId) {
  const placeholders = clientIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE clients 
    SET server_id = ?
    WHERE id IN (${placeholders})
  `);
  
  return stmt.run(serverId, ...clientIds);
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

function logAction(clientId, action, success = true, details = null, serverId = null) {
  const stmt = db.prepare(`
    INSERT INTO action_logs (client_id, server_id, action, success, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  return stmt.run(clientId, serverId, action, success ? 1 : 0, details);
}

function logServerAction(serverId, action, success = true, details = null) {
  const stmt = db.prepare(`
    INSERT INTO action_logs (server_id, action, success, details)
    VALUES (?, ?, ?, ?)
  `);
  
  return stmt.run(serverId, action, success ? 1 : 0, details);
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

function getServerLogs(serverId, limit = 50) {
  const stmt = db.prepare(`
    SELECT l.*, c.name as client_name 
    FROM action_logs l
    LEFT JOIN clients c ON l.client_id = c.id
    WHERE l.server_id = ?
    ORDER BY l.created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(serverId, limit);
}

function getRecentLogs(limit = 100) {
  const stmt = db.prepare(`
    SELECT l.*, c.name as client_name, s.name as server_name
    FROM action_logs l
    LEFT JOIN clients c ON l.client_id = c.id
    LEFT JOIN servers s ON l.server_id = s.id
    ORDER BY l.created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(limit);
}

// ========== ESTATÍSTICAS ==========

function getStats() {
  const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const totalServers = db.prepare('SELECT COUNT(*) as count FROM servers WHERE is_active = 1').get().count;
  const activeSessions = db.prepare('SELECT COUNT(*) as count FROM clients WHERE has_active_session = 1').get().count;
  const clientsWithoutServer = db.prepare('SELECT COUNT(*) as count FROM clients WHERE server_id IS NULL').get().count;
  
  const byPlayer = db.prepare(`
    SELECT player_type, COUNT(*) as count 
    FROM clients 
    GROUP BY player_type
  `).all();
  
  const byServer = db.prepare(`
    SELECT s.name, s.color, COUNT(c.id) as count
    FROM servers s
    LEFT JOIN clients c ON c.server_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    ORDER BY count DESC
    LIMIT 5
  `).all();
  
  const recentActivity = db.prepare(`
    SELECT COUNT(*) as count 
    FROM action_logs 
    WHERE created_at >= datetime('now', '-24 hours')
  `).get().count;
  
  return {
    totalClients,
    totalServers,
    activeSessions,
    clientsWithoutServer,
    byPlayer,
    byServer,
    recentActivity
  };
}

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
  
  // Servidores
  createServer,
  getServerById,
  getServerByName,
  getAllServers,
  getServersWithClientCount,
  updateServer,
  deleteServer,
  
  // Clientes
  createClient,
  getClientById,
  getClientByMac,
  searchClients,
  getAllClients,
  getClientsByServer,
  getClientsWithoutServer,
  updateClient,
  updateClientServer,
  updateClientsServerBulk,
  deleteClient,
  updateSessionStatus,
  updateLastUsed,
  
  // Logs
  logAction,
  logServerAction,
  getClientLogs,
  getServerLogs,
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