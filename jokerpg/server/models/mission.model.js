/**
 * Joker RPG — Modelo de Dados de Missões e Progresso dos Jogadores
 * Gerencia o catálogo mestre de missões, sincronização de progresso e resgate de recompensas.
 */

const { query } = require('../../database/connection');

const MissionModel = {
  /**
   * Localiza uma missão pelo identificador UUID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const sql = `
      SELECT id, title, description, category, requirement_type, requirement_count, reward_xp, reward_coins, created_at
      FROM missions
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Retorna a listagem de missões cadastradas com filtros de categoria e paginação.
   * @param {object} filters
   * @returns {Promise<{ missions: Array, total: number }>}
   */
  async findAll({ category = null, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) AS total FROM missions WHERE ${whereClause};`;
    const { rows: countRows } = await query(countSql, params);
    const total = parseInt(countRows[0].total, 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const listSql = `
      SELECT id, title, description, category, requirement_type, requirement_count, reward_xp, reward_coins, created_at
      FROM missions
      WHERE ${whereClause}
      ORDER BY category ASC, reward_xp DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;
    const { rows: missions } = await query(listSql, params);
    return { missions, total };
  },

  /**
   * Cria uma nova missão no catálogo global.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async create(data, client = null) {
    const {
      title,
      description,
      category,
      requirementType,
      requirementCount,
      rewardXp = 0,
      rewardCoins = 0
    } = data;

    const sql = `
      INSERT INTO missions (
        title, 
        description, 
        category, 
        requirement_type, 
        requirement_count, 
        reward_xp, 
        reward_coins
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, title, description, category, requirement_type, requirement_count, reward_xp, reward_coins, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [
      title,
      description,
      category,
      requirementType,
      requirementCount,
      rewardXp,
      rewardCoins
    ]);
    return rows[0];
  },

  /**
   * Atualiza as informações de uma missão cadastrada.
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async update(id, data) {
    const {
      title,
      description,
      category,
      requirementType,
      requirementCount,
      rewardXp,
      rewardCoins
    } = data;

    const sql = `
      UPDATE missions
      SET 
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        category = COALESCE($4, category),
        requirement_type = COALESCE($5, requirement_type),
        requirement_count = COALESCE($6, requirement_count),
        reward_xp = COALESCE($7, reward_xp),
        reward_coins = COALESCE($8, reward_coins)
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, title, description, category, requirement_type, requirement_count, reward_xp, reward_coins;
    `;
    const params = [
      id,
      title,
      description,
      category,
      requirementType,
      requirementCount,
      rewardXp,
      rewardCoins
    ];
    const { rows } = await query(sql, params);
    return rows[0];
  },

  /**
   * Remove logicamente uma missão.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async softDelete(id) {
    const sql = `UPDATE missions SET deleted_at = NOW() WHERE id = $1;`;
    await query(sql, [id]);
  },

  /**
   * Retorna o quadro completo de missões do jogador com progresso e estado de resgate.
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getUserMissions(userId) {
    const sql = `
      SELECT 
        m.id AS mission_id,
        m.title,
        m.description,
        m.category,
        m.requirement_type,
        m.requirement_count,
        m.reward_xp,
        m.reward_coins,
        COALESCE(um.current_progress, 0) AS current_progress,
        COALESCE(um.is_completed, FALSE) AS is_completed,
        um.claimed_at,
        um.id AS user_mission_id
      FROM missions m
      LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = $1
      WHERE m.deleted_at IS NULL
      ORDER BY 
        (um.claimed_at IS NOT NULL) ASC,
        (COALESCE(um.is_completed, FALSE)) DESC,
        m.category ASC,
        m.reward_xp DESC;
    `;
    const { rows } = await query(sql, [userId]);
    return rows;
  },

  /**
   * Inicializa o vínculo de todas as missões ativas para um novo usuário.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async initUserMissions(userId, client = null) {
    const sql = `
      INSERT INTO user_missions (user_id, mission_id, current_progress, is_completed)
      SELECT $1, id, 0, FALSE
      FROM missions
      WHERE deleted_at IS NULL
      ON CONFLICT (user_id, mission_id) DO NOTHING;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId]);
  },

  /**
   * Incrementa o progresso de missões do jogador com base em um gatilho de combate/ação.
   * Marca como completada quando o progresso alcança ou supera requirement_count.
   * @param {string} userId
   * @param {string} requirementType
   * @param {number} [amount=1]
   * @param {object} [client]
   * @returns {Promise<Array>} Retorna as missões recém-completadas
   */
  async incrementProgress(userId, requirementType, amount = 1, client = null) {
    const sql = `
      UPDATE user_missions um
      SET 
        current_progress = LEAST(m.requirement_count, um.current_progress + $3),
        is_completed = CASE 
          WHEN (um.current_progress + $3) >= m.requirement_count THEN TRUE 
          ELSE um.is_completed 
        END,
        updated_at = NOW()
      FROM missions m
      WHERE 
        um.mission_id = m.id 
        AND um.user_id = $1 
        AND m.requirement_type = $2 
        AND um.is_completed = FALSE 
        AND m.deleted_at IS NULL
      RETURNING um.id, um.mission_id, m.title, um.current_progress, m.requirement_count, um.is_completed;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [userId, requirementType, amount]);
    return rows;
  },

  /**
   * Resgata a recompensa de uma missão completada.
   * @param {string} userId
   * @param {string} missionId
   * @param {object} [client]
   * @returns {Promise<object|null>} Retorna { reward_xp, reward_coins } se resgatado com sucesso
   */
  async claimReward(userId, missionId, client = null) {
    const sql = `
      UPDATE user_missions um
      SET claimed_at = NOW(), updated_at = NOW()
      FROM missions m
      WHERE 
        um.mission_id = m.id 
        AND um.user_id = $1 
        AND um.mission_id = $2 
        AND um.is_completed = TRUE 
        AND um.claimed_at IS NULL
      RETURNING m.reward_xp, m.reward_coins, m.title;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [userId, missionId]);
    return rows[0] || null;
  },

  /**
   * Retorna a quantidade total de missões cadastradas ativas.
   * @returns {Promise<number>}
   */
  async count() {
    const sql = `SELECT COUNT(*) AS total FROM missions WHERE deleted_at IS NULL;`;
    const { rows } = await query(sql);
    return parseInt(rows[0].total, 10);
  }
};

module.exports = MissionModel;