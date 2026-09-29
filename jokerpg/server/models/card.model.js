/**
 * Joker RPG — Modelo de Dados de Cartas Táticas
 * Gerencia o catálogo global de cartas, inventário de jogadores e consultas estruturadas.
 */

const { query } = require('../../database/connection');

const CardModel = {
  /**
   * Localiza uma carta pelo identificador UUID.
   * @param {string} id
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<object|null>}
   */
  async findById(id, client = null) {
    const sql = `
      SELECT 
        id, 
        name, 
        description, 
        type, 
        rarity, 
        element, 
        energy_cost, 
        damage, 
        defense, 
        break_damage, 
        effect_code, 
        cooldown, 
        requirement, 
        combo_modifier,
        created_at, 
        updated_at
      FROM cards
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza uma carta pelo seu nome exato.
   * @param {string} name
   * @returns {Promise<object|null>}
   */
  async findByName(name) {
    const sql = `
      SELECT id, name, type, rarity, element, energy_cost, damage, defense
      FROM cards
      WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [name]);
    return rows[0] || null;
  },

  /**
   * Retorna cartas ativas a partir de uma lista de IDs (usado para validação em lote e montagem de decks).
   * @param {Array<string>} ids
   * @param {object} [client]
   * @returns {Promise<Array>}
   */
  async findCardsByIds(ids, client = null) {
    if (!ids || ids.length === 0) return [];
    const sql = `
      SELECT 
        id, 
        name, 
        description, 
        type, 
        rarity, 
        element, 
        energy_cost, 
        damage, 
        defense, 
        break_damage, 
        effect_code, 
        cooldown, 
        requirement, 
        combo_modifier
      FROM cards
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [ids]);
    return rows;
  },

  /**
   * Listagem paginada e filtrada de cartas para o catálogo e painel administrativo.
   * @param {object} filters
   * @returns {Promise<{ cards: Array, total: number }>}
   */
  async findAll({ type, rarity, element, search = '', page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    if (rarity) {
      params.push(rarity);
      conditions.push(`rarity = $${params.length}`);
    }

    if (element) {
      params.push(element);
      conditions.push(`element = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) AS total FROM cards WHERE ${whereClause};`;
    const { rows: countRows } = await query(countSql, params);
    const total = parseInt(countRows[0].total, 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const listSql = `
      SELECT 
        id, 
        name, 
        description, 
        type, 
        rarity, 
        element, 
        energy_cost, 
        damage, 
        defense, 
        break_damage, 
        effect_code, 
        cooldown, 
        requirement, 
        combo_modifier,
        created_at
      FROM cards
      WHERE ${whereClause}
      ORDER BY energy_cost ASC, rarity ASC, name ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const { rows: cards } = await query(listSql, params);
    return { cards, total };
  },

  /**
   * Cria uma nova carta no catálogo global.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async create(data, client = null) {
    const {
      name,
      description,
      type,
      rarity,
      element,
      energy_cost,
      damage = 0,
      defense = 0,
      break_damage = 10,
      effect_code = 'NONE',
      cooldown = 0,
      requirement = {},
      combo_modifier = 'STANDARD',
      imageData = null,
      imageMime = null
    } = data;

    const sql = `
      INSERT INTO cards (
        name, 
        description, 
        type, 
        rarity, 
        element, 
        energy_cost, 
        damage, 
        defense, 
        break_damage, 
        effect_code, 
        cooldown, 
        requirement, 
        combo_modifier,
        image_data,
        image_mime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, name, type, rarity, element, energy_cost, damage, defense, break_damage, effect_code, cooldown, combo_modifier, created_at;
    `;

    const params = [
      name,
      description,
      type,
      rarity,
      element,
      energy_cost,
      damage,
      defense,
      break_damage,
      effect_code,
      cooldown,
      JSON.stringify(requirement),
      combo_modifier,
      imageData,
      imageMime
    ];

    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, params);
    return rows[0];
  },

  /**
   * Atualiza as propriedades mecânicas e textuais de uma carta.
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async update(id, data) {
    const {
      name,
      description,
      type,
      rarity,
      element,
      energy_cost,
      damage,
      defense,
      break_damage,
      effect_code,
      cooldown,
      requirement,
      combo_modifier
    } = data;

    const sql = `
      UPDATE cards
      SET 
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        type = COALESCE($4, type),
        rarity = COALESCE($5, rarity),
        element = COALESCE($6, element),
        energy_cost = COALESCE($7, energy_cost),
        damage = COALESCE($8, damage),
        defense = COALESCE($9, defense),
        break_damage = COALESCE($10, break_damage),
        effect_code = COALESCE($11, effect_code),
        cooldown = COALESCE($12, cooldown),
        requirement = COALESCE($13, requirement),
        combo_modifier = COALESCE($14, combo_modifier),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, type, rarity, element, energy_cost, damage, defense, break_damage, effect_code, cooldown, combo_modifier;
    `;

    const params = [
      id,
      name,
      description,
      type,
      rarity,
      element,
      energy_cost,
      damage,
      defense,
      break_damage,
      effect_code,
      cooldown,
      requirement ? JSON.stringify(requirement) : null,
      combo_modifier
    ];

    const { rows } = await query(sql, params);
    return rows[0];
  },

  /**
   * Atualiza a ilustração binária da carta em BYTEA.
   * @param {string} id
   * @param {Buffer} imageData
   * @param {string} imageMime
   * @returns {Promise<void>}
   */
  async updateImage(id, imageData, imageMime) {
    const sql = `
      UPDATE cards
      SET image_data = $2, image_mime = $3, updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [id, imageData, imageMime]);
  },

  /**
   * Obtém a ilustração em BYTEA para streaming HTTP.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getImage(id) {
    const sql = `
      SELECT image_data, image_mime
      FROM cards
      WHERE id = $1 AND image_data IS NOT NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Remove logicamente uma carta preservando referências no histórico de turnos.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async softDelete(id) {
    const sql = `
      UPDATE cards
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [id]);
  },

  /**
   * Adiciona ou incrementa quantidade de cartas no inventário do jogador.
   * @param {string} userId
   * @param {string} cardId
   * @param {number} [quantity=1]
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async addCardToUser(userId, cardId, quantity = 1, client = null) {
    const sql = `
      INSERT INTO user_cards (user_id, card_id, quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, card_id) 
      DO UPDATE SET quantity = user_cards.quantity + EXCLUDED.quantity;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId, cardId, quantity]);
  },

  /**
   * Retorna todo o inventário de cartas do jogador com detalhes técnicos associados.
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getUserCards(userId) {
    const sql = `
      SELECT 
        uc.id AS user_card_id,
        uc.quantity,
        uc.acquired_at,
        c.id AS card_id,
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
      FROM user_cards uc
      JOIN cards c ON uc.card_id = c.id
      WHERE uc.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.energy_cost ASC, c.rarity ASC, c.name ASC;
    `;
    const { rows } = await query(sql, [userId]);
    return rows;
  },

  /**
   * Obtém a quantidade em posse de uma carta específica para um jogador.
   * @param {string} userId
   * @param {string} cardId
   * @param {object} [client]
   * @returns {Promise<number>}
   */
  async getUserCardQuantity(userId, cardId, client = null) {
    const sql = `
      SELECT quantity
      FROM user_cards
      WHERE user_id = $1 AND card_id = $2
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [userId, cardId]);
    return rows.length > 0 ? rows[0].quantity : 0;
  },

  /**
   * Retorna o total de cartas registradas e ativas.
   * @returns {Promise<number>}
   */
  async count() {
    const sql = `SELECT COUNT(*) AS total FROM cards WHERE deleted_at IS NULL;`;
    const { rows } = await query(sql);
    return parseInt(rows[0].total, 10);
  }
};

module.exports = CardModel;