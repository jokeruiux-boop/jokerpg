/**
 * Joker RPG — Controlador de Cartas e Coleção Tática (Card Controller)
 * Gerencia a navegação pelo catálogo global de cartas, inspeção de atributos de combate
 * e visualização do inventário de cartas desbloqueadas pelo jogador.
 */

const CardService = require('../services/card.service');
const { CARD_TYPES, ELEMENTS, RARITIES } = require('../config/constants');

const CardController = {
  /**
   * Renderiza a galeria de cartas do jogo confrontada com a posse de exemplares do inventário.
   * Rota: GET /cards
   */
  async index(req, res, next) {
    try {
      const {
        type,
        rarity,
        element,
        search,
        page = 1
      } = req.query;

      const userId = req.session.user.id;

      // Executa consulta paralela do catálogo global e das cartas em posse do combatente
      const [catalogResult, userCards] = await Promise.all([
        CardService.listCards({
          type,
          rarity,
          element,
          search,
          page,
          limit: 16
        }),
        CardService.getUserCards(userId)
      ]);

      // Mapeia as quantidades em posse de cada carta pelo identificador UUID
      const ownedQuantityMap = {};
      for (const uc of userCards) {
        ownedQuantityMap[uc.card_id] = uc.quantity;
      }

      res.render('cards/index', {
        pageTitle: 'Arsenal de Cartas Táticas — Joker RPG',
        cards: catalogResult.cards,
        pagination: {
          total: catalogResult.total,
          totalPages: catalogResult.totalPages,
          currentPage: catalogResult.currentPage
        },
        filters: {
          type: type || '',
          rarity: rarity || '',
          element: element || '',
          search: search || ''
        },
        constants: {
          CARD_TYPES,
          ELEMENTS,
          RARITIES
        },
        ownedQuantityMap,
        totalOwnedUnique: userCards.length
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Retorna os detalhes técnicos de uma carta em formato JSON (para modais e inspeções no frontend).
   * Rota: GET /cards/:id/details
   */
  async getCardDetails(req, res, next) {
    try {
      const { id } = req.params;
      const card = await CardService.getCardById(id);

      return res.json({
        success: true,
        card
      });
    } catch (error) {
      return res.status(error.statusCode || 404).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = CardController;