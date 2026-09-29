/**
 * Joker RPG — Modelo de Dados de Auditoria Administrativa (Admin Logs)
 * Registra e consulta operações críticas executadas por administradores para integridade e rastreabilidade.
 */

const { query } = require('../../database/connection');

const AdminLogModel = {
  /**
   * Registra um novo evento administrativo na trilha de auditoria.
   * @param {object} data
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<object>}
   */
  async create({
    adminId = null,
    actionName,
    targetEntity,
    targetId = null,
    ipAddress = '127.0.0.1',
    details = {}
  }, client = null) {
    const sql = `
      INSERT INTO admin_logs (
        admin_id, 
        action_name, 
        target_entity, 
        target_id, 
        ip_address, 
        details
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, admin_id, action_name, target_entity, target_id, ip_address, details, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [
      adminId,
      actionName,
      targetEntity,
      targetId ? String(targetId) : null,
      ipAddress,
      JSON.stringify(details)
    ]);
    return rows[0];
  },

  /**
   * Retorna os logs administrativos de forma paginada e filtrada.
   * @param {object} filters
   * @returns {Promise<{ logs: Array, total: number }>}
   */
  async findAllPaginated({ limit = 25, offset = 0, actionName = null, adminId = null } = {}) {
    const conditions = [];
    const params = [];

    if (actionName) {
      params.push(actionName);
      conditions.push(`al.action_name = $${params.length}`);
    }

    if (adminId) {
      params.push(adminId);
      conditions.push(`al.admin_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM admin_logs al ${whereClause};`;
    const { rows: countRows } = await query(countSql, params);
    const total = parseInt(countRows[0].total, 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const listSql = `
      SELECT 
        al.id,
        al.admin_id,
        al.action_name,
        al.target_entity,
        al.target_id,
        al.ip_address,
        al.details,
        al.created_at,
        u.username AS admin_username,
        u.email AS admin_email
      FROM admin_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;
    const { rows: logs } = await query(listSql, params);
    return { logs, total };
  },

  /**
   * Retorna os registros de auditoria mais recentes (para Dashboard Admin).
   * @param {number} [limit=10]
   * @returns {Promise<Array>}
   */
  async getRecentLogs(limit = 10) {
    const sql = `
      SELECT 
        al.id,
        al.action_name,
        al.target_entity,
        al.target_id,
        al.ip_address,
        al.details,
        al.created_at,
        u.username AS admin_username
      FROM admin_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT $1;
    `;
    const { rows } = await query(sql, [limit]);
    return rows;
  },

  /**
   * Contagem total de logs registrados no sistema.
   * @returns {Promise<number>}
   */
  async count() {
    const sql = `SELECT COUNT(*) AS total FROM admin_logs;`;
    const { rows } = await query(sql);
    return parseInt(rows[0].total, 10);
  }
};

module.exports = AdminLogModel;