/**
 * Joker RPG — Controlador de Baralhos e Montagem Tática (Deck Controller)
 * Gerencia a interface de construção de baralhos (Deck Builder), criação,
 * edição de slots, duplicação, exclusão e ativação de baralhos principais.
 */

const DeckService = require('../services/deck.service');
const CardService = require('../services/card.service');
const { COMBAT_RULES } = require('../config/constants');

const DeckController = {
  /**
   * Renderiza o painel central do Deck Builder com a lista de baralhos do usuário,
   * o baralho atualmente selecionado e todo o acervo de cartas disponíveis no inventário.
   * Rota: GET /decks
   */
  async index(req, res, next) {
    try {
      const userId = req.session.user.id;
      const selectedDeckId = req.query.deckId;

      // Executa consulta paralela dos baralhos e do inventário de cartas do jogador
      const [userDecks, userCards] = await Promise.all([
        DeckService.getUserDecks(userId),
        CardService.getUserCards(userId)
      ]);

      let currentDeck = null;
      if (selectedDeckId) {
        currentDeck = await DeckService.getDeckById(selectedDeckId, userId);
      } else if (userDecks.length > 0) {
        const activeEntry = userDecks.find((d) => d.is_active) || userDecks[0];
        currentDeck = await DeckService.getDeckById(activeEntry.id, userId);
      }

      res.render('decks/index', {
        pageTitle: 'Montador de Baralhos Táticos — Joker RPG',
        decks: userDecks,
        currentDeck,
        userCards,
        rules: {
          minCards: COMBAT_RULES.MIN_DECK_CARDS,
          maxCards: COMBAT_RULES.MAX_DECK_CARDS
        },
        successMessage: req.query.success ? 'Operação realizada com sucesso no baralho.' : null,
        errorMessage: req.query.error || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Retorna os dados completos e as cartas de um baralho em formato JSON (para manipulação no frontend).
   * Rota: GET /decks/:id/data
   */
  async getDeckData(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { id } = req.params;

      const deck = await DeckService.getDeckById(id, userId);

      return res.json({
        success: true,
        deck
      });
    } catch (error) {
      return res.status(error.statusCode || 404).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Processa a criação de um novo baralho tático.
   * Rota: POST /decks
   */
  async create(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { name, cardIds, isActive } = req.body;

      const newDeck = await DeckService.createDeck(userId, {
        name,
        cardIds,
        isActive: isActive === 'true' || isActive === true
      });

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(201).json({
          success: true,
          message: 'Baralho tático criado com sucesso!',
          deck: newDeck
        });
      }

      return res.redirect(`/decks?deckId=${newDeck.id}&success=1`);
    } catch (error) {
      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message
        });
      }
      next(error);
    }
  },

  /**
   * Atualiza a composição de cartas e o nome de um baralho existente.
   * Rota: POST /decks/:id/update
   */
  async update(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { id } = req.params;
      const { name, cardIds } = req.body;

      const updatedDeck = await DeckService.updateDeck(id, userId, {
        name,
        cardIds
      });

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: 'Composição do baralho atualizada com sucesso!',
          deck: updatedDeck
        });
      }

      return res.redirect(`/decks?deckId=${id}&success=1`);
    } catch (error) {
      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message
        });
      }
      next(error);
    }
  },

  /**
   * Define o baralho selecionado como o ativo para partidas futuras.
   * Rota: POST /decks/:id/set-active
   */
  async setActive(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { id } = req.params;

      await DeckService.setActiveDeck(userId, id);

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: 'Baralho ativado com sucesso para confrontos!'
        });
      }

      return res.redirect(`/decks?deckId=${id}&success=1`);
    } catch (error) {
      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message
        });
      }
      next(error);
    }
  },

  /**
   * Duplica um baralho existente atribuindo um sufixo ao nome.
   * Rota: POST /decks/:id/duplicate
   */
  async duplicate(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { id } = req.params;

      const duplicated = await DeckService.duplicateDeck(id, userId);

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: 'Baralho duplicado com êxito!',
          deck: duplicated
        });
      }

      return res.redirect(`/decks?deckId=${duplicated.id}&success=1`);
    } catch (error) {
      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message
        });
      }
      next(error);
    }
  },

  /**
   * Exclui logicamente um baralho existente (respeitando a regra de manter ao menos um).
   * Rota: POST /decks/:id/delete
   */
  async delete(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { id } = req.params;

      await DeckService.deleteDeck(id, userId);

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: 'Baralho removido da sua coleção.'
        });
      }

      return res.redirect('/decks?success=1');
    } catch (error) {
      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message
        });
      }
      next(error);
    }
  }
};

module.exports = DeckController;