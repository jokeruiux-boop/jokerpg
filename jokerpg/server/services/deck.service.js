/**
 * Joker RPG — Serviço de Baralhos e Montagem Tática (Deck Service)
 * Gerencia ciclo de vida dos baralhos (criação, edição, duplicação, ativação e exclusão),
 * garantindo a validação de posse de cartas no inventário e recalculando o poder de combate.
 */

const DeckModel = require('../models/deck.model');
const CardModel = require('../models/card.model');
const UserModel = require('../models/user.model');
const PowerService = require('./power.service');
const { COMBAT_RULES } = require('../config/constants');
const { withTransaction } = require('../../database/connection');

const DeckService = {
  /**
   * Retorna todos os baralhos de um jogador.
   * @param {string} userId - UUID do jogador
   * @returns {Promise<Array>}
   */
  async getUserDecks(userId) {
    return await DeckModel.findByUserId(userId);
  },

  /**
   * Retorna os detalhes de um baralho específico com todas as suas cartas preenchidas.
   * Valida a titularidade da conta sobre o baralho.
   * @param {string} deckId - UUID do baralho
   * @param {string} userId - UUID do jogador solicitante
   * @returns {Promise<object>}
   */
  async getDeckById(deckId, userId) {
    const deck = await DeckModel.getDeckWithCards(deckId);
    if (!deck || deck.user_id !== userId) {
      const error = new Error('Baralho não encontrado ou você não possui autorização para visualizá-lo.');
      error.statusCode = 404;
      throw error;
    }
    return deck;
  },

  /**
   * Retorna o baralho atualmente configurado como ativo para o combatente.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getActiveDeck(userId) {
    return await DeckModel.findActiveByUserId(userId);
  },

  /**
   * Valida se o usuário é proprietário e possui exemplares suficientes das cartas para a composição do baralho.
   * @param {string} userId
   * @param {Array<string>} cardIds
   * @param {object} [client]
   */
  async validateCardOwnership(userId, cardIds, client = null) {
    // Contabiliza ocorrências requeridas de cada carta no baralho
    const counts = {};
    for (const id of cardIds) {
      counts[id] = (counts[id] || 0) + 1;
    }

    for (const [cardId, requiredQty] of Object.entries(counts)) {
      const ownedQty = await CardModel.getUserCardQuantity(userId, cardId, client);
      if (ownedQty < requiredQty) {
        const card = await CardModel.findById(cardId, client);
        const cardName = card ? card.name : cardId;
        const error = new Error(
          `Inventário insuficiente para a carta '${cardName}'. Exigido: ${requiredQty}, em posse: ${ownedQty}.`
        );
        error.statusCode = 400;
        throw error;
      }
    }
  },

  /**
   * Cria um novo baralho com validação de 10 cartas e registro nos slots.
   * @param {string} userId - UUID do jogador
   * @param {object} params
   * @param {string} params.name - Nome do baralho
   * @param {Array<string>} params.cardIds - Lista ordenada de 10 UUIDs de cartas
   * @param {boolean} [params.isActive=false] - Se deve ser ativado imediatamente
   * @returns {Promise<object>} Baralho criado
   */
  async createDeck(userId, { name, cardIds, isActive = false }) {
    if (!Array.isArray(cardIds) || cardIds.length !== COMBAT_RULES.MIN_DECK_CARDS) {
      const error = new Error(`O baralho deve conter exatamente ${COMBAT_RULES.MIN_DECK_CARDS} cartas regulamentares.`);
      error.statusCode = 400;
      throw error;
    }

    return await withTransaction(async (client) => {
      // 1. Valida posse das cartas no inventário
      await this.validateCardOwnership(userId, cardIds, client);

      // 2. Se for o primeiro baralho criado pelo jogador, força como ativo
      const userDecks = await DeckModel.findByUserId(userId);
      const shouldBeActive = isActive || userDecks.length === 0;

      // 3. Cria registro mestre do baralho
      const newDeck = await DeckModel.create({
        userId,
        name,
        isActive: shouldBeActive
      }, client);

      // 4. Insere as cartas nos slots
      await DeckModel.setCards(newDeck.id, cardIds, client);

      // 5. Se o baralho foi ativado, recalcula o poder e desativa os anteriores
      if (shouldBeActive) {
        await DeckModel.setActive(userId, newDeck.id, client);
        await PowerService.recalculateAndPersistUserPower(userId, client);
      }

      return newDeck;
    });
  },

  /**
   * Atualiza o nome e a composição de cartas de um baralho existente.
   * @param {string} deckId - UUID do baralho
   * @param {string} userId - UUID do jogador
   * @param {object} params
   * @param {string} params.name - Nome atualizado
   * @param {Array<string>} params.cardIds - Nova lista de 10 cartas
   * @returns {Promise<object>} Baralho atualizado
   */
  async updateDeck(deckId, userId, { name, cardIds }) {
    await this.getDeckById(deckId, userId);

    if (!Array.isArray(cardIds) || cardIds.length !== COMBAT_RULES.MIN_DECK_CARDS) {
      const error = new Error(`A composição deve conter exatamente ${COMBAT_RULES.MIN_DECK_CARDS} cartas.`);
      error.statusCode = 400;
      throw error;
    }

    return await withTransaction(async (client) => {
      await this.validateCardOwnership(userId, cardIds, client);
      await DeckModel.update(deckId, userId, { name });
      await DeckModel.setCards(deckId, cardIds, client);

      const activeDeck = await DeckModel.findActiveByUserId(userId, client);
      if (activeDeck && activeDeck.id === deckId) {
        await PowerService.recalculateAndPersistUserPower(userId, client);
      }

      return await DeckModel.getDeckWithCards(deckId);
    });
  },

  /**
   * Define um baralho como o ativo para partidas futuras e recalcula o índice de poder.
   * @param {string} userId - UUID do jogador
   * @param {string} deckId - UUID do baralho
   * @returns {Promise<void>}
   */
  async setActiveDeck(userId, deckId) {
    await this.getDeckById(deckId, userId);

    await withTransaction(async (client) => {
      await DeckModel.setActive(userId, deckId, client);
      await PowerService.recalculateAndPersistUserPower(userId, client);
    });
  },

  /**
   * Duplica um baralho existente atribuindo novo identificador.
   * @param {string} deckId - UUID do baralho fonte
   * @param {string} userId - UUID do jogador
   * @returns {Promise<object>} Novo baralho duplicado
   */
  async duplicateDeck(deckId, userId) {
    const sourceDeck = await this.getDeckById(deckId, userId);

    if (!sourceDeck.cards || sourceDeck.cards.length !== COMBAT_RULES.MIN_DECK_CARDS) {
      const error = new Error('Não é possível duplicar um baralho com cartas incompletas.');
      error.statusCode = 400;
      throw error;
    }

    const cardIds = sourceDeck.cards.map((c) => c.id);
    const duplicatedName = `${sourceDeck.name} (Cópia)`.slice(0, 50);

    return await this.createDeck(userId, {
      name: duplicatedName,
      cardIds,
      isActive: false
    });
  },

  /**
   * Remove logicamente (Soft Delete) um baralho. Impede a exclusão do baralho ativo se for o único disponível.
   * @param {string} deckId - UUID do baralho
   * @param {string} userId - UUID do jogador
   * @returns {Promise<void>}
   */
  async deleteDeck(deckId, userId) {
    const deck = await this.getDeckById(deckId, userId);
    const totalDecks = await DeckModel.countUserDecks(userId);

    if (totalDecks <= 1) {
      const error = new Error('Você deve manter ao menos um baralho ativo em sua coleção.');
      error.statusCode = 400;
      throw error;
    }

    await withTransaction(async (client) => {
      await DeckModel.softDelete(deckId, userId);

      // Se o deck deletado era o ativo, ativa o primeiro baralho remanescente
      if (deck.is_active) {
        const remaining = await DeckModel.findByUserId(userId);
        if (remaining.length > 0) {
          await DeckModel.setActive(userId, remaining[0].id, client);
          await PowerService.recalculateAndPersistUserPower(userId, client);
        }
      }
    });
  }
};

module.exports = DeckService;