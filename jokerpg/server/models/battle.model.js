/**
 * Joker RPG — Modelo de Dados de Batalhas e Histórico Telemétrico
 * Gerencia persistência de partidas, combatentes, ações executadas por turno e telemetria de combate.
 */

const { query } = require('../../database/connection');

const BattleModel = {
  /**
   * Cria uma nova sessão de batalha no banco de dados.
   * @param {object} data
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<object>}
   */
  async create({ mode, status = 'IN_PROGRESS' }, client = null) {
    const sql = `
      INSERT INTO battles (mode, status)
      VALUES ($1, $2)
      RETURNING id, mode, status, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [mode, status]);
    return rows[0];
  },

  /**
   * Adiciona o snapshot inicial de um jogador participante da partida.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async addPlayer({ battleId, userId, characterId, initialHp, initialPower }, client = null) {
    const sql = `
      INSERT INTO battle_players (battle_id, user_id, character_id, initial_hp, initial_power)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, battle_id, user_id, character_id, initial_hp, initial_power;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [battleId, userId, characterId, initialHp, initialPower]);
    return rows[0];
  },

  /**
   * Localiza uma batalha pelo seu identificador UUID.
   * @param {string} id
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async findById(id, client = null) {
    const sql = `
      SELECT id, mode, status, winner_id, loser_id, total_turns, duration_seconds, created_at, finished_at
      FROM battles
      WHERE id = $1
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Recupera a batalha acompanhada de todos os jogadores participantes e dados do personagem associado.
   * @param {string} id
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async getBattleWithPlayers(id, client = null) {
    const battle = await this.findById(id, client);
    if (!battle) return null;

    const playersSql = `
      SELECT 
        bp.id AS battle_player_id,
        bp.user_id,
        bp.character_id,
        bp.initial_hp,
        bp.initial_power,
        u.username,
        u.level AS user_level,
        c.name AS character_name,
        c.element AS character_element,
        c.class AS character_class,
        c.base_hp,
        c.attack,
        c.defense,
        c.speed,
        c.energy,
        c.critical_chance,
        c.passive_ability,
        c.active_ability,
        c.ultimate_ability
      FROM battle_players bp
      JOIN users u ON bp.user_id = u.id
      LEFT JOIN characters c ON bp.character_id = c.id
      WHERE bp.battle_id = $1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows: players } = await exec(playersSql, [id]);
    battle.players = players;
    return battle;
  },

  /**
   * Atualiza o status da batalha.
   * @param {string} id
   * @param {string} status
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async updateStatus(id, status, client = null) {
    const sql = `
      UPDATE battles
      SET status = $2
      WHERE id = $1;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [id, status]);
  },

  /**
   * Finaliza uma partida registrando vencedor, perdedor, duração e turnos totais.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async finishBattle({ battleId, winnerId, loserId, totalTurns, durationSeconds }, client = null) {
    const sql = `
      UPDATE battles
      SET 
        status = 'FINISHED',
        winner_id = $2,
        loser_id = $3,
        total_turns = $4,
        duration_seconds = $5,
        finished_at = NOW()
      WHERE id = $1;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [battleId, winnerId, loserId, totalTurns, durationSeconds]);
  },

  /**
   * Registra uma ação tática no histórico telemetrizado do combate.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async recordAction({
    battleId,
    turnNumber,
    actorUserId,
    actionType,
    cardId = null,
    damageDealt = 0,
    breakDealt = 0,
    wasCritical = false,
    comboMultiplier = 1.00
  }, client = null) {
    const sql = `
      INSERT INTO battle_actions (
        battle_id, 
        turn_number, 
        actor_user_id, 
        action_type, 
        card_id, 
        damage_dealt, 
        break_dealt, 
        was_critical, 
        combo_multiplier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, battle_id, turn_number, actor_user_id, action_type, card_id, damage_dealt, break_dealt, was_critical, combo_multiplier, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [
      battleId,
      turnNumber,
      actorUserId,
      actionType,
      cardId,
      damageDealt,
      breakDealt,
      wasCritical,
      comboMultiplier
    ]);
    return rows[0];
  },

  /**
   * Retorna a sequência cronológica completa de ações executadas em uma batalha (para Replay).
   * @param {string} battleId
   * @returns {Promise<Array>}
   */
  async getBattleActions(battleId) {
    const sql = `
      SELECT 
        ba.id,
        ba.turn_number,
        ba.actor_user_id,
        ba.action_type,
        ba.damage_dealt,
        ba.break_dealt,
        ba.was_critical,
        ba.combo_multiplier,
        ba.created_at,
        u.username AS actor_username,
        c.name AS card_name,
        c.type AS card_type,
        c.element AS card_element
      FROM battle_actions ba
      LEFT JOIN users u ON ba.actor_user_id = u.id
      LEFT JOIN cards c ON ba.card_id = c.id
      WHERE ba.battle_id = $1
      ORDER BY ba.turn_number ASC, ba.created_at ASC;
    `;
    const { rows } = await query(sql, [battleId]);
    return rows;
  },

  /**
   * Retorna o histórico paginado de confrontos de um jogador.
   * @param {string} userId
   * @param {object} pagination
   * @returns {Promise<{ battles: Array, total: number }>}
   */
  async getUserBattleHistory(userId, { limit = 10, offset = 0 } = {}) {
    const countSql = `
      SELECT COUNT(*) AS total
      FROM battle_players bp
      JOIN battles b ON bp.battle_id = b.id
      WHERE bp.user_id = $1 AND b.status = 'FINISHED';
    `;
    const { rows: countRows } = await query(countSql, [userId]);
    const total = parseInt(countRows[0].total, 10);

    const listSql = `
      SELECT 
        b.id,
        b.mode,
        b.status,
        b.winner_id,
        b.loser_id,
        b.total_turns,
        b.duration_seconds,
        b.created_at,
        b.finished_at,
        w.username AS winner_username,
        l.username AS loser_username,
        c.name AS character_used
      FROM battle_players bp
      JOIN battles b ON bp.battle_id = b.id
      LEFT JOIN users w ON b.winner_id = w.id
      LEFT JOIN users l ON b.loser_id = l.id
      LEFT JOIN characters c ON bp.character_id = c.id
      WHERE bp.user_id = $1 AND b.status = 'FINISHED'
      ORDER BY b.finished_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const { rows: battles } = await query(listSql, [userId, limit, offset]);
    return { battles, total };
  },

  /**
   * Retorna os números agregados de combate de um jogador (Vitórias, Derrotas, Total).
   * @param {string} userId
   * @returns {Promise<{ wins: number, losses: number, total: number }>}
   */
  async getUserStats(userId) {
    const sql = `
      SELECT 
        COUNT(CASE WHEN winner_id = $1 THEN 1 END)::int AS wins,
        COUNT(CASE WHEN loser_id = $1 THEN 1 END)::int AS losses,
        COUNT(*)::int AS total
      FROM battles
      WHERE (winner_id = $1 OR loser_id = $1) AND status = 'FINISHED';
    `;
    const { rows } = await query(sql, [userId]);
    return rows[0] || { wins: 0, losses: 0, total: 0 };
  },

  /**
   * Retorna as batalhas mais recentes do jogo (para Dashboard e Painel Admin).
   * @param {number} [limit=10]
   * @returns {Promise<Array>}
   */
  async getRecentBattles(limit = 10) {
    const sql = `
      SELECT 
        b.id,
        b.mode,
        b.status,
        b.total_turns,
        b.duration_seconds,
        b.created_at,
        b.finished_at,
        w.username AS winner_username,
        l.username AS loser_username
      FROM battles b
      LEFT JOIN users w ON b.winner_id = w.id
      LEFT JOIN users l ON b.loser_id = l.id
      WHERE b.status = 'FINISHED'
      ORDER BY b.finished_at DESC
      LIMIT $1;
    `;
    const { rows } = await query(sql, [limit]);
    return rows;
  },

  /**
   * Contagem total de confrontos concluídos.
   * @returns {Promise<number>}
   */
  async count() {
    const sql = `SELECT COUNT(*) AS total FROM battles WHERE status = 'FINISHED';`;
    const { rows } = await query(sql);
    return parseInt(rows[0].total, 10);
  }
};

module.exports = BattleModel;