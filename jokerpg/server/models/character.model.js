/**
 * Joker RPG — Modelo de Dados de Personagens
 * Gerencia o catálogo mestre de combatentes, desbloqueios e evolução de personagens dos jogadores.
 */

const { query } = require('../../database/connection');

const CharacterModel = {
  /**
   * Localiza um personagem pelo seu identificador UUID.
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
        rarity, 
        element, 
        class, 
        base_hp, 
        attack, 
        defense, 
        speed, 
        energy, 
        critical_chance, 
        power_rating, 
        passive_ability, 
        active_ability, 
        ultimate_ability,
        created_at, 
        updated_at
      FROM characters
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Localiza um personagem pelo nome exato.
   * @param {string} name
   * @returns {Promise<object|null>}
   */
  async findByName(name) {
    const sql = `
      SELECT id, name, rarity, element, class, power_rating
      FROM characters
      WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [name]);
    return rows[0] || null;
  },

  /**
   * Retorna a listagem de personagens com paginação e filtros opcionais.
   * @param {object} filters
   * @returns {Promise<{ characters: Array, total: number }>}
   */
  async findAll({ rarity, element, characterClass, search = '', page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    if (rarity) {
      params.push(rarity);
      conditions.push(`rarity = $${params.length}`);
    }

    if (element) {
      params.push(element);
      conditions.push(`element = $${params.length}`);
    }

    if (characterClass) {
      params.push(characterClass);
      conditions.push(`class = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) AS total FROM characters WHERE ${whereClause};`;
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
        rarity, 
        element, 
        class, 
        base_hp, 
        attack, 
        defense, 
        speed, 
        energy, 
        critical_chance, 
        power_rating,
        created_at
      FROM characters
      WHERE ${whereClause}
      ORDER BY power_rating DESC, name ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const { rows: characters } = await query(listSql, params);
    return { characters, total };
  },

  /**
   * Insere um novo personagem no catálogo mestre.
   * @param {object} data
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async create(data, client = null) {
    const {
      name,
      description,
      rarity,
      element,
      class: characterClass,
      base_hp,
      attack,
      defense,
      speed,
      energy = 10,
      critical_chance = 5.0,
      power_rating = 100,
      passive_ability = {},
      active_ability = {},
      ultimate_ability = {},
      imageData = null,
      imageMime = null,
      avatarData = null,
      avatarMime = null
    } = data;

    const sql = `
      INSERT INTO characters (
        name, 
        description, 
        rarity, 
        element, 
        class, 
        base_hp, 
        attack, 
        defense, 
        speed, 
        energy, 
        critical_chance, 
        power_rating, 
        passive_ability, 
        active_ability, 
        ultimate_ability,
        image_data,
        image_mime,
        avatar_data,
        avatar_mime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id, name, rarity, element, class, base_hp, attack, defense, speed, energy, power_rating, created_at;
    `;

    const params = [
      name,
      description,
      rarity,
      element,
      characterClass,
      base_hp,
      attack,
      defense,
      speed,
      energy,
      critical_chance,
      power_rating,
      JSON.stringify(passive_ability),
      JSON.stringify(active_ability),
      JSON.stringify(ultimate_ability),
      imageData,
      imageMime,
      avatarData,
      avatarMime
    ];

    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, params);
    return rows[0];
  },

  /**
   * Atualiza as informações estatísticas e textuais de um personagem.
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async update(id, data) {
    const {
      name,
      description,
      rarity,
      element,
      class: characterClass,
      base_hp,
      attack,
      defense,
      speed,
      energy,
      critical_chance,
      power_rating,
      passive_ability,
      active_ability,
      ultimate_ability
    } = data;

    const sql = `
      UPDATE characters
      SET 
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        rarity = COALESCE($4, rarity),
        element = COALESCE($5, element),
        class = COALESCE($6, class),
        base_hp = COALESCE($7, base_hp),
        attack = COALESCE($8, attack),
        defense = COALESCE($9, defense),
        speed = COALESCE($10, speed),
        energy = COALESCE($11, energy),
        critical_chance = COALESCE($12, critical_chance),
        power_rating = COALESCE($13, power_rating),
        passive_ability = COALESCE($14, passive_ability),
        active_ability = COALESCE($15, active_ability),
        ultimate_ability = COALESCE($16, ultimate_ability),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, rarity, element, class, base_hp, attack, defense, speed, energy, power_rating;
    `;

    const params = [
      id,
      name,
      description,
      rarity,
      element,
      characterClass,
      base_hp,
      attack,
      defense,
      speed,
      energy,
      critical_chance,
      power_rating,
      passive_ability ? JSON.stringify(passive_ability) : null,
      active_ability ? JSON.stringify(active_ability) : null,
      ultimate_ability ? JSON.stringify(ultimate_ability) : null
    ];

    const { rows } = await query(sql, params);
    return rows[0];
  },

  /**
   * Atualiza os buffers de imagem (ilustração mestre ou avatar) no banco via BYTEA.
   * @param {string} id
   * @param {object} imageBuffers
   * @returns {Promise<void>}
   */
  async updateImages(id, { imageData, imageMime, avatarData, avatarMime }) {
    const sql = `
      UPDATE characters
      SET 
        image_data = COALESCE($2, image_data),
        image_mime = COALESCE($3, image_mime),
        avatar_data = COALESCE($4, avatar_data),
        avatar_mime = COALESCE($5, avatar_mime),
        updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [id, imageData, imageMime, avatarData, avatarMime]);
  },

  /**
   * Recupera o binário da arte principal em BYTEA para streaming HTTP.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getImage(id) {
    const sql = `
      SELECT image_data, image_mime
      FROM characters
      WHERE id = $1 AND image_data IS NOT NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Recupera o binário do avatar em BYTEA para streaming HTTP.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getAvatar(id) {
    const sql = `
      SELECT avatar_data, avatar_mime
      FROM characters
      WHERE id = $1 AND avatar_data IS NOT NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Desativa logicamente um personagem preservando histórico de combates.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async softDelete(id) {
    const sql = `
      UPDATE characters
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [id]);
  },

  /**
   * Desbloqueia um personagem para um usuário.
   * @param {string} userId
   * @param {string} characterId
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async unlockForUser(userId, characterId, client = null) {
    const sql = `
      INSERT INTO user_characters (user_id, character_id, level, xp)
      VALUES ($1, $2, 1, 0)
      ON CONFLICT (user_id, character_id) DO NOTHING
      RETURNING id, user_id, character_id, level, xp, unlocked_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [userId, characterId]);
    return rows[0] || null;
  },

  /**
   * Retorna todos os personagens desbloqueados pelo jogador com atributos calculados.
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async findUserCharacters(userId) {
    const sql = `
      SELECT 
        uc.id AS user_character_id,
        uc.level,
        uc.xp,
        uc.unlocked_at,
        c.id AS character_id,
        c.name,
        c.description,
        c.rarity,
        c.element,
        c.class,
        c.base_hp,
        c.attack,
        c.defense,
        c.speed,
        c.energy,
        c.critical_chance,
        c.power_rating,
        c.passive_ability,
        c.active_ability,
        c.ultimate_ability
      FROM user_characters uc
      JOIN characters c ON uc.character_id = c.id
      WHERE uc.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.power_rating DESC, uc.level DESC;
    `;
    const { rows } = await query(sql, [userId]);
    return rows;
  },

  /**
   * Verifica se o usuário possui determinado personagem desbloqueado.
   * @param {string} userId
   * @param {string} characterId
   * @returns {Promise<boolean>}
   */
  async isUnlockedByUser(userId, characterId) {
    const sql = `
      SELECT 1 FROM user_characters
      WHERE user_id = $1 AND character_id = $2
      LIMIT 1;
    `;
    const { rows } = await query(sql, [userId, characterId]);
    return rows.length > 0;
  },

  /**
   * Atualiza nível e experiência de um personagem em posse do jogador.
   * @param {string} userId
   * @param {string} characterId
   * @param {object} progression
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async updateUserCharacterLevel(userId, characterId, { level, xp }, client = null) {
    const sql = `
      UPDATE user_characters
      SET level = $3, xp = $4
      WHERE user_id = $1 AND character_id = $2;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId, characterId, level, xp]);
  },

  /**
   * Contagem total de personagens ativos.
   * @returns {Promise<number>}
   */
  async count() {
    const sql = `SELECT COUNT(*) AS total FROM characters WHERE deleted_at IS NULL;`;
    const { rows } = await query(sql);
    return parseInt(rows[0].total, 10);
  }
};

module.exports = CharacterModel;