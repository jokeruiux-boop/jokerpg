/**
 * Joker RPG — Serviço de Cartas Táticas e Inventário (Card Service)
 * Coordena o catálogo global de cartas, criação e edição administrativa,
 * upload de ilustrações em BYTEA e gerenciamento de inventário dos jogadores.
 */

const CardModel = require('../models/card.model');
const UserModel = require('../models/user.model');

const CardService = {
  /**
   * Retorna a listagem de cartas com suporte a filtros e paginação.
   * @param {object} filters - Filtros de busca (type, rarity, element, search, page, limit)
   * @returns {Promise<{ cards: Array, total: number, totalPages: number, currentPage: number }>}
   */
  async listCards(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(filters.limit, 10) || 16));

    const result = await CardModel.findAll({
      ...filters,
      page,
      limit
    });

    const totalPages = Math.ceil(result.total / limit) || 1;

    return {
      cards: result.cards,
      total: result.total,
      totalPages,
      currentPage: page
    };
  },

  /**
   * Localiza uma carta pelo identificador UUID.
   * @param {string} id - UUID da carta
   * @returns {Promise<object>}
   */
  async getCardById(id) {
    const card = await CardModel.findById(id);
    if (!card) {
      const error = new Error('Carta não encontrada no catálogo.');
      error.statusCode = 404;
      throw error;
    }
    return card;
  },

  /**
   * Cria uma nova carta no catálogo mestre (Operação Administrativa).
   * @param {object} data - Atributos técnicos e regras da carta
   * @param {object|null} [file=null] - Arquivo binário de ilustração do Multer
   * @returns {Promise<object>} Carta cadastrada
   */
  async createCard(data, file = null) {
    const existing = await CardModel.findByName(data.name);
    if (existing) {
      const error = new Error(`Já existe uma carta cadastrada com o nome '${data.name}'.`);
      error.statusCode = 400;
      throw error;
    }

    const cardPayload = {
      ...data,
      imageData: file ? file.buffer : null,
      imageMime: file ? file.mimetype : null
    };

    return await CardModel.create(cardPayload);
  },

  /**
   * Atualiza as especificações técnicas de uma carta no catálogo global.
   * @param {string} id - UUID da carta
   * @param {object} data - Novos parâmetros
   * @returns {Promise<object>} Carta atualizada
   */
  async updateCard(id, data) {
    await this.getCardById(id);
    return await CardModel.update(id, data);
  },

  /**
   * Atualiza a ilustração binária da carta no PostgreSQL em BYTEA.
   * @param {string} id - UUID da carta
   * @param {object} file - Arquivo de upload do Multer
   * @returns {Promise<void>}
   */
  async updateCardImage(id, file) {
    await this.getCardById(id);

    if (!file || !file.buffer) {
      const error = new Error('Nenhum arquivo de imagem válido foi fornecido.');
      error.statusCode = 400;
      throw error;
    }

    await CardModel.updateImage(id, file.buffer, file.mimetype);
  },

  /**
   * Remove logicamente (Soft Delete) uma carta do catálogo ativo.
   * Preserva referências históricas em partidas anteriores.
   * @param {string} id - UUID da carta
   * @returns {Promise<void>}
   */
  async deleteCard(id) {
    await this.getCardById(id);
    await CardModel.softDelete(id);
  },

  /**
   * Retorna todo o inventário de cartas desbloqueadas e pertencentes a um jogador.
   * @param {string} userId - UUID do jogador
   * @returns {Promise<Array>}
   */
  async getUserCards(userId) {
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('Jogador não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    return await CardModel.getUserCards(userId);
  },

  /**
   * Atribui ou incrementa uma carta no inventário de um jogador.
   * @param {string} userId
   * @param {string} cardId
   * @param {number} [quantity=1]
   * @returns {Promise<void>}
   */
  async grantCard(userId, cardId, quantity = 1) {
    await this.getCardById(cardId);
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('Jogador não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const grantQty = Math.max(1, parseInt(quantity, 10) || 1);
    await CardModel.addCardToUser(userId, cardId, grantQty);
  },

  /**
   * Recupera o binário da ilustração da carta em BYTEA para streaming HTTP.
   * @param {string} id
   * @returns {Promise<object|null>} { image_data, image_mime }
   */
  async getCardImage(id) {
    return await CardModel.getImage(id);
  }
};

module.exports = CardService;