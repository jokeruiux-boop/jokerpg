/**
 * Joker RPG — Modelo de Dados de Usuários, Credenciais e Autenticação
 * Encapsula consultas parametrizadas ao PostgreSQL Neon com suporte a soft delete e transações.
 */

const { query } = require('../../database/connection');

const UserModel = {
  /**
   * Busca um usuário ativo pelo seu identificador UUID.
   * @param {string} id - UUID do usuário
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<object|null>}
   */
  async findById(id, client = null) {
    const sql = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.role, 
        u.level, 
        u.xp, 
        u.coins, 
        u.power_index, 
        u.main_character_id, 
        u.is_blocked, 
        u.created_at, 
        u.updated_at,
        c.name AS main_character_name,
        c.element AS main_character_element,
        c.class AS main_character_class
      FROM users u
      LEFT JOIN characters c ON u.main_character_id = c.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      LIMIT 1;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Busca um usuário ativo pelo endereço de e-mail.
   * @param {string} email
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    const sql = `
      SELECT id, username, email, role, level, xp, coins, power_index, main_character_id, is_blocked, created_at
      FROM users
      WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [email]);
    return rows[0] || null;
  },

  /**
   * Busca um usuário ativo pelo nome de usuário (username).
   * @param {string} username
   * @returns {Promise<object|null>}
   */
  async findByUsername(username) {
    const sql = `
      SELECT id, username, email, role, level, xp, coins, power_index, main_character_id, is_blocked, created_at
      FROM users
      WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [username]);
    return rows[0] || null;
  },

  /**
   * Cria o registro mestre de um novo usuário.
   * @param {object} data
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<object>}
   */
  async create({ username, email, role = 'USER_NORMAL', mainCharacterId = null }, client = null) {
    const sql = `
      INSERT INTO users (username, email, role, main_character_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, role, level, xp, coins, power_index, main_character_id, created_at;
    `;
    const exec = client ? client.query.bind(client) : query;
    const { rows } = await exec(sql, [username, email, role, mainCharacterId]);
    return rows[0];
  },

  /**
   * Cria o registro de credencial local associada ao usuário.
   * @param {string} userId
   * @param {string} passwordHash
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async createAuth(userId, passwordHash, client = null) {
    const sql = `
      INSERT INTO user_auth (user_id, password_hash)
      VALUES ($1, $2);
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId, passwordHash]);
  },

  /**
   * Obtém a senha criptografada de um usuário para conferência de autenticação.
   * @param {string} userId
   * @returns {Promise<string|null>}
   */
  async findAuthByUserId(userId) {
    const sql = `
      SELECT password_hash
      FROM user_auth
      WHERE user_id = $1
      LIMIT 1;
    `;
    const { rows } = await query(sql, [userId]);
    return rows[0] ? rows[0].password_hash : null;
  },

  /**
   * Atualiza a senha criptografada de um usuário.
   * @param {string} userId
   * @param {string} passwordHash
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async updatePasswordHash(userId, passwordHash, client = null) {
    const sql = `
      UPDATE user_auth
      SET password_hash = $2, updated_at = NOW()
      WHERE user_id = $1;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId, passwordHash]);
  },

  /**
   * Localiza conta externa vinculada via OAuth (Google).
   * @param {string} provider
   * @param {string} providerUserId
   * @returns {Promise<object|null>}
   */
  async findOAuth(provider, providerUserId) {
    const sql = `
      SELECT oa.user_id, u.username, u.email, u.role, u.is_blocked
      FROM oauth_accounts oa
      JOIN users u ON oa.user_id = u.id
      WHERE oa.provider = $1 AND oa.provider_user_id = $2 AND u.deleted_at IS NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [provider, providerUserId]);
    return rows[0] || null;
  },

  /**
   * Associa conta OAuth externa a um usuário existente.
   * @param {string} userId
   * @param {string} provider
   * @param {string} providerUserId
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async createOAuth(userId, provider, providerUserId, client = null) {
    const sql = `
      INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (provider, provider_user_id) DO NOTHING;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId, provider, providerUserId]);
  },

  /**
   * Registra token de redefinição de senha com validade temporária.
   * @param {string} userId
   * @param {string} tokenHash
   * @param {Date} expiresAt
   * @returns {Promise<void>}
   */
  async createPasswordResetToken(userId, tokenHash, expiresAt) {
    const sql = `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3);
    `;
    await query(sql, [userId, tokenHash, expiresAt]);
  },

  /**
   * Busca token de redefinição válido e ainda não utilizado.
   * @param {string} tokenHash
   * @returns {Promise<object|null>}
   */
  async findPasswordResetToken(tokenHash) {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      LIMIT 1;
    `;
    const { rows } = await query(sql, [tokenHash]);
    return rows[0] || null;
  },

  /**
   * Marca token de recuperação como utilizado para prevenir reutilizações.
   * @param {string} tokenId
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async markPasswordResetTokenUsed(tokenId, client = null) {
    const sql = `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [tokenId]);
  },

  /**
   * Atualiza dados permitidos do perfil do jogador.
   * @param {string} userId
   * @param {object} fields
   * @returns {Promise<object>}
   */
  async updateProfile(userId, { username, mainCharacterId }) {
    const sql = `
      UPDATE users
      SET 
        username = COALESCE($2, username),
        main_character_id = COALESCE($3, main_character_id),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, username, email, role, level, xp, coins, power_index, main_character_id;
    `;
    const { rows } = await query(sql, [userId, username, mainCharacterId]);
    return rows[0];
  },

  /**
   * Atualiza o avatar dinâmico em formato binário BYTEA.
   * @param {string} userId
   * @param {Buffer} buffer
   * @param {string} mimeType
   * @returns {Promise<void>}
   */
  async updateAvatar(userId, buffer, mimeType) {
    const sql = `
      UPDATE users
      SET avatar_data = $2, avatar_mime = $3, updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [userId, buffer, mimeType]);
  },

  /**
   * Recupera o avatar armazenado em BYTEA para streaming HTTP.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getAvatar(userId) {
    const sql = `
      SELECT avatar_data, avatar_mime
      FROM users
      WHERE id = $1 AND avatar_data IS NOT NULL
      LIMIT 1;
    `;
    const { rows } = await query(sql, [userId]);
    return rows[0] || null;
  },

  /**
   * Atualiza métricas de progressão calculadas pelo servidor (Level, XP, Moedas, Poder).
   * @param {string} userId
   * @param {object} progressionData
   * @param {object} [client]
   * @returns {Promise<void>}
   */
  async updateProgression(userId, { level, xp, coins, powerIndex }, client = null) {
    const sql = `
      UPDATE users
      SET 
        level = COALESCE($2, level),
        xp = COALESCE($3, xp),
        coins = COALESCE($4, coins),
        power_index = COALESCE($5, power_index),
        updated_at = NOW()
      WHERE id = $1;
    `;
    const exec = client ? client.query.bind(client) : query;
    await exec(sql, [userId, level, xp, coins, powerIndex]);
  },

  /**
   * Listagem paginada e filtrada de usuários para o painel administrativo.
   * @param {object} filters
   * @returns {Promise<{ users: Array, total: number }>}
   */
  async findAllPaginated({ page = 1, limit = 20, search = '', role = '', isBlocked = null }) {
    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }

    if (isBlocked !== null) {
      params.push(isBlocked === 'true' || isBlocked === true);
      conditions.push(`is_blocked = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) AS total FROM users WHERE ${whereClause};`;
    const { rows: countRows } = await query(countSql, params);
    const total = parseInt(countRows[0].total, 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const listSql = `
      SELECT id, username, email, role, level, xp, coins, power_index, is_blocked, created_at
      FROM users
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const { rows: users } = await query(listSql, params);
    return { users, total };
  },

  /**
   * Bloqueia ou desbloqueia um jogador.
   * @param {string} userId
   * @param {boolean} isBlocked
   * @returns {Promise<void>}
   */
  async setBlockedStatus(userId, isBlocked) {
    const sql = `
      UPDATE users
      SET is_blocked = $2, updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [userId, isBlocked]);
  },

  /**
   * Realiza a remoção lógica (Soft Delete) do usuário preservando histórico de partidas.
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async softDelete(userId) {
    const sql = `
      UPDATE users
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1;
    `;
    await query(sql, [userId]);
  }
};

module.exports = UserModel;