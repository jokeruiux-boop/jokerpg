/**
 * Joker RPG — Modelo de Dados de Rankings e Temporadas Competitivas
 * Gerencia tabelas de classificação global, por temporada, pontuação ELO/Rating e temporadas ativas.
 */

const { query } = require('../../database/connection');

const RankingModel = {
  /**
   * Retorna a classificação global paginada com critérios de ordenação dinâmicos.
   * @param {object} options
   * @returns {Promise<{ leaderboard: Array, total: number }>}
   */
  async getGlobalRanking({ limit = 20, offset = 0, sortBy = 'rating' } = {}) {
    const validSortFields = {
      rating: 'r.rating DESC, r.wins DESC',
      power: 'u.power_index DESC, r.rating DESC',
      wins: 'r.wins DESC, r.rating DESC',
      level: 'u.level DESC, u.xp DESC'
    };

    const orderByClause = validSortFields[sortBy] || validSortFields.rating;

    const countSql = `
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      LEFT JOIN rankings r ON u.id = r.user_id AND r.season_id IS NULL
      WHERE u.deleted_at IS NULL AND u.is_blocked = FALSE;
    `;
    const { rows: countRows } = await query(countSql);
    const total = parseInt(countRows[0].total, 10);

    const listSql = `
      SELECT 
        u.id AS user_id,
        u.username,
        u.level,
        u.xp,
        u.power_index,
        COALESCE(r.rating, 1000) AS rating,
        COALESCE(r.wins, 0) AS wins,
        COALESCE(r.losses, 0) AS losses,
        c.name AS main_character_name,
        c.element AS main_character_element,
        c.rarity AS main_character_rarity,
        ROW_NUMBER() OVER (ORDER BY ${orderByClause}) AS rank_position
      FROM users u
      LEFT JOIN rankings r ON u.id = r.user_id AND r.season_id IS NULL
      LEFT JOIN characters c ON u.main_character_id = c.id
      WHERE u.deleted_at IS NULL AND u.is_blocked = FALSE
      ORDER BY ${orderByClause}
      LIMIT $1 OFFSET $2;
    `;
    const { rows: leaderboard } = await query(listSql, [limit, offset]);
    return { leaderboard, total };
  },

  /**
   * Retorna a classificação de uma temporada específica.
   * @param {string} seasonId
   * @param {object} options
   * @returns {Promise<{ leaderboard: Array, total: number }>}
   */
  async getSeasonRanking(seasonId, { limit = 20, offset = 0 } = {}) {
    const countSql = `
      SELECT COUNT(*) AS total
      FROM rankings r
      JOIN users u ON r.user_id = u.id
      WHERE r.season_id = $1 AND u.deleted_at IS NULL AND u.is_blocked = FALSE;
    `;
    const { rows: countRows } = await query(countSql, [seasonId]);
    const total = parseInt(countRows[0].total, 10);

    const listSql = `
      SELECT 
        u.id AS user_id,
        u.username,
        u.level,
        u.power_index,
        r.rating,
        r.wins,
        r.losses,
        c.name AS main_character_name,
        c.element AS main_character_element,
        ROW_NUMBER() OVER (ORDER BY r.rating DESC, r.wins DESC) AS rank_position
      FROM rankings r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN characters c ON u.main_character_id = c.id
      WHERE r.season_id = $1 AND u.deleted_at IS NULL AND u.is_blocked = FALSE
      ORDER BY r.rating DESC, r.wins DESC
      LIMIT $2 OFFSET $3;
    `;
    const { rows: leaderboard } = await query(listSql, [seasonId, limit, offset]);
    return { leaderboard, total };
  },

  /**
   * Retorna o ranking e a posição exata de um usuário específico.
   * @param {string} userId
   * @param {string|null} [seasonId=null]
   * @returns {Promise<object|null>}
   */
  async getUserRanking(userId, seasonId = null) {
    const sql = `
      WITH ranked_users AS (
        SELECT 
          r.user_id,
          r.rating,
          r.wins,
          r.losses,
          r.power_index,
          RANK() OVER (ORDER BY r.rating DESC, r.wins DESC) as rank_position
        FROM rankings r
        JOIN users u ON r.user_id = u.id
        WHERE 
          (r.season_id = $2 OR ($2 IS NULL AND r.season_id IS NULL))
          AND u.deleted_at IS NULL 
          AND u.is_blocked = FALSE
      )
      SELECT * FROM ranked_users WHERE user_id = $1 LIMIT 1;
    `;
    const { rows } = await query(sql, [userId, seasonId]);
    return rows[0] || null;
  },

  /**
   * Atualiza ou inicializa a pontuação de ranking do jogador após o término de um combate.
   * @param {object} data
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<void>}
   */
  async upsertRanking({ userId, seasonId = null, ratingDelta = 0, isWin = false, powerIndex = 0 }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const winsDelta = isWin ? 1 : 0;
    const lossesDelta = isWin ? 0 : 1;

    // Condição para tratar season_id NULL com unique constraint (COALESCE workaround / query direcionada)
    if (!seasonId) {
      const sqlGlobal = `
        INSERT INTO rankings (user_id, season_id, rating, wins, losses, power_index, updated_at)
        VALUES ($1, NULL, GREATEST(100, 1000 + $2), $3, $4, $5, NOW())
        ON CONFLICT (user_id, season_id)
        DO UPDATE SET 
          rating = GREATEST(100, rankings.rating + $2),
          wins = rankings.wins + $3,
          losses = rankings.losses + $4,
          power_index = $5,
          updated_at = NOW();
      `;
      await exec(sqlGlobal, [userId, ratingDelta, winsDelta, lossesDelta, powerIndex]);
    } else {
      const sqlSeason = `
        INSERT INTO rankings (user_id, season_id, rating, wins, losses, power_index, updated_at)
        VALUES ($1, $2, GREATEST(100, 1000 + $3), $4, $5, $6, NOW())
        ON CONFLICT (user_id, season_id)
        DO UPDATE SET 
          rating = GREATEST(100, rankings.rating + $3),
          wins = rankings.wins + $4,
          losses = rankings.losses + $5,
          power_index = $6,
          updated_at = NOW();
      `;
      await exec(sqlSeason, [userId, seasonId, ratingDelta, winsDelta, lossesDelta, powerIndex]);
    }
  },

  /**
   * Retorna a temporada competitiva atualmente ativa.
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async getCurrentActiveSeason(client = null) {
    const sql = `
      SELECT id, name, start_date, end_date, status, rewards
      FROM seasons
      WHERE status = 'ACTIVE' AND start_date <= NOW() AND end_date >= NOW() AND deleted_at IS NULL
      ORDER BY end_date ASC
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql);
    return rows[0] || null;
  },

  /**
   * Cria uma nova temporada competitiva.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async createSeason({ name, startDate, endDate, status = 'UPCOMING', rewards = {} }, client = null) {
    const sql = `
      INSERT INTO seasons (name, start_date, end_date, status, rewards)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, start_date, end_date, status, rewards, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [name, startDate, endDate, status, JSON.stringify(rewards)]);
    return rows[0];
  },

  /**
   * Retorna todas as temporadas cadastradas.
   * @returns {Promise<Array>}
   */
  async getAllSeasons() {
    const sql = `
      SELECT id, name, start_date, end_date, status, rewards, created_at
      FROM seasons
      WHERE deleted_at IS NULL
      ORDER BY start_date DESC;
    `;
    const { rows } = await query(sql);
    return rows;
  },

  /**
   * Retorna os detalhes de uma temporada específica.
   * @param {string} seasonId
   * @returns {Promise<object|null>}
   */
  async getSeasonById(seasonId) {
    const sql = `
      SELECT id, name, start_date, end_date, status, rewards, created_at
      FROM seasons
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [seasonId]);
    return rows[0] || null;
  },

  /**
   * Atualiza o estado da temporada ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED').
   * @param {string} seasonId
   * @param {string} status
   * @returns {Promise<void>}
   */
  async updateSeasonStatus(seasonId, status) {
    const sql = `
      UPDATE seasons
      SET status = $2
      WHERE id = $1;
    `;
    await query(sql, [seasonId, status]);
  }
};

module.exports = RankingModel;