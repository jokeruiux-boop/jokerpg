/**
 * Joker RPG — Modelo de Dados de Baralhos (Decks) e Slots
 * Gerencia baralhos de jogadores, vínculos de cartas por slot e ativação de baralho mestre.
 */

const { query } = require('../../database/connection');

const DeckModel = {
  /**
   * Localiza um baralho pelo seu identificador UUID.
   * @param {string} deckId
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<object|null>}
   */
  async findById(deckId, client = null) {
    const sql = `
      SELECT id, user_id, name, is_active, created_at, updated_at
      FROM decks
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [deckId]);
    return rows[0] || null;
  },

  /**
   * Retorna todos os baralhos de um usuário com a contagem de cartas inseridas.
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async findByUserId(userId) {
    const sql = `
      SELECT 
        d.id, 
        d.name, 
        d.is_active, 
        d.created_at, 
        d.updated_at,
        COUNT(dc.id)::int AS card_count
      FROM decks d
      LEFT JOIN deck_cards dc ON d.id = dc.deck_id
      WHERE d.user_id = $1 AND d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.is_active DESC, d.created_at DESC;
    `;
    const { rows } = await query(sql, [userId]);
    return rows;
  },

  /**
   * Retorna o baralho atualmente ativo do jogador acompanhado de todas as cartas ordenadas por slot.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async findActiveByUserId(userId, client = null) {
    const deckSql = `
      SELECT id, user_id, name, is_active, created_at
      FROM decks
      WHERE user_id = $1 AND is_active = TRUE AND deleted_at IS NULL
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows: deckRows } = await exec(deckSql, [userId]);
    
    if (deckRows.length === 0) return null;
    const deck = deckRows[0];

    const cardsSql = `
      SELECT 
        dc.slot_index,
        c.id, 
        c.name, 
        c.description, 
        c.type, 
        c.rarity, 
        c.element, 
        c.energy_cost, 
        c.damage, 
        c.defense, 
        c.break_damage, 
        c.effect_code, 
        c.cooldown, 
        c.requirement, 
        c.combo_modifier
      FROM deck_cards dc
      JOIN cards c ON dc.card_id = c.id
      WHERE dc.deck_id = $1 AND c.deleted_at IS NULL
      ORDER BY dc.slot_index ASC;
    `;
    const { rows: cards } = await exec(cardsSql, [deck.id]);
    deck.cards = cards;
    return deck;
  },

  /**
   * Cria o registro mestre de um novo baralho.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async create({ userId, name, isActive = false }, client = null) {
    const sql = `
      INSERT INTO decks (user_id, name, is_active)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, name, is_active, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [userId, name, isActive]);
    return rows[0];
  },

  /**
   * Atualiza as cartas atribuídas aos slots (1 a 10) de um baralho específico.
   * Remove associações prévias e insere a nova composição em lote.
   * @param {string} deckId
   * @param {Array<string>} cardIds
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async setCards(deckId, cardIds, client = null) {
    const deleteSql = `DELETE FROM deck_cards WHERE deck_id = $1;`;
    const exec = client ? client.query.bind(client) : query;
    await exec(deleteSql, [deckId]);

    for (let index = 0; index < cardIds.length; index++) {
      const slotIndex = index + 1;
      const cardId = cardIds[index];
      const insertSql = `
        INSERT INTO deck_cards (deck_id, card_id, slot_index)
        VALUES ($1, $2, $3);
      `;
      await exec(insertSql, [deckId, cardId, slotIndex]);
    }
  },

  /**
   * Define um baralho como ativo para o jogador, desativando automaticamente os demais.
   * @param {string} userId
   * @param {string} deckId
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async setActive(userId, deckId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    
    // Desativa todos os decks do usuário
    await exec(
      `UPDATE decks SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1;`,
      [userId]
    );

    // Ativa o deck especificado
    await exec(
      `UPDATE decks SET is_active = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2;`,
      [deckId, userId]
    );
  },

  /**
   * Retorna os detalhes de um baralho acompanhado de suas cartas preenchidas.
   * @param {string} deckId
   * @returns {Promise<object|null>}
   */
  async getDeckWithCards(deckId) {
    const deck = await this.findById(deckId);
    if (!deck) return null;

    const cardsSql = `
      SELECT 
        dc.slot_index,
        c.id, 
        c.name, 
        c.description, 
        c.type, 
        c.rarity, 
        c.element, 
        c.energy_cost, 
        c.damage, 
        c.defense, 
        c.break_damage, 
        c.effect_code, 
        c.cooldown, 
        c.combo_modifier
      FROM deck_cards dc
      JOIN cards c ON dc.card_id = c.id
      WHERE dc.deck_id = $1 AND c.deleted_at IS NULL
      ORDER BY dc.slot_index ASC;
    `;
    const { rows: cards } = await query(cardsSql, [deckId]);
    deck.cards = cards;
    return deck;
  },

  /**
   * Atualiza o nome do baralho.
   * @param {string} deckId
   * @param {string} userId
   * @param {string} name
   * @returns {Promise<object>}
   */
  async update(deckId, userId, { name }) {
    const sql = `
      UPDATE decks
      SET name = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING id, user_id, name, is_active, updated_at;
    `;
    const { rows } = await query(sql, [deckId, userId, name]);
    return rows[0] || null;
  },

  /**
   * Realiza a remoção lógica (Soft Delete) do baralho do jogador.
   * @param {string} deckId
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async softDelete(deckId, userId) {
    const sql = `
      UPDATE decks
      SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND user_id = $2;
    `;
    await query(sql, [deckId, userId]);
  },

  /**
   * Retorna a quantidade total de baralhos criados por um usuário.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countUserDecks(userId) {
    const sql = `SELECT COUNT(*) AS total FROM decks WHERE user_id = $1 AND deleted_at IS NULL;`;
    const { rows } = await query(sql, [userId]);
    return parseInt(rows[0].total, 10);
  }
};

module.exports = DeckModel;