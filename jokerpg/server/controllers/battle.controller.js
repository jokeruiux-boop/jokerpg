/**
 * Joker RPG — Controlador da Arena de Combate e Duelos (Battle Controller)
 * Gerencia o lobby de batalha, inicialização de confrontos (PvE/PvP), execução de ações
 * táticas por rodada, alternância de turnos, desistências e histórico de partidas.
 */

const BattleService = require('../services/battle.service');
const BattleModel = require('../models/battle.model');
const DeckModel = require('../models/deck.model');
const CharacterModel = require('../models/character.model');
const { BATTLE_MODES } = require('../config/constants');

const BattleController = {
  /**
   * Renderiza o lobby da Arena de Combate com seleção de modos (PvE Treino, PvP Casual, PvP Ranqueado).
   * Rota: GET /battle
   */
  async arena(req, res, next) {
    try {
      const userId = req.session.user.id;

      // Valida se o combatente possui um herói principal e um baralho ativo configurado
      const [activeDeck, userStats] = await Promise.all([
        DeckModel.findActiveByUserId(userId),
        BattleModel.getUserStats(userId)
      ]);

      const hasReadyDeck = Boolean(activeDeck && activeDeck.cards && activeDeck.cards.length >= 10);
      const hasMainCharacter = Boolean(req.session.user.main_character_id);

      res.render('battle/arena', {
        pageTitle: 'Arena Tática de Duelos — Joker RPG',
        modes: BATTLE_MODES,
        hasReadyDeck,
        hasMainCharacter,
        activeDeck,
        stats: userStats,
        errorMessage: (!hasReadyDeck || !hasMainCharacter)
          ? 'Para entrar na arena, você deve possuir um combatente principal e um baralho com 10 cartas.'
          : null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Inicializa uma partida (Modo Treinamento PvE ou Duelo Direto).
   * Rota: POST /battle/create
   */
  async create(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { mode = 'PVE_TRAINING' } = req.body;

      const battleState = await BattleService.createBattle({
        player1Id: userId,
        player2Id: null, // PvE utiliza bot gerado automaticamente
        mode
      });

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(201).json({
          success: true,
          battleId: battleState.battleId,
          battle: battleState
        });
      }

      return res.redirect(`/battle/room/${battleState.battleId}`);
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
   * Renderiza a interface do campo de batalha (Battle HUD Room).
   * Rota: GET /battle/room/:id
   */
  async room(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.session.user.id;

      let battle = BattleService.getBattleState(id);

      // Se não estiver na memória (ex: partida já concluída), consulta o histórico no PostgreSQL
      if (!battle) {
        const dbBattle = await BattleModel.getBattleWithPlayers(id);
        if (!dbBattle) {
          return res.redirect('/battle?error=not_found');
        }
        if (dbBattle.status === 'FINISHED') {
          return res.redirect(`/battle/result/${id}`);
        }
        return res.redirect('/battle');
      }

      // Valida se o usuário pertence a este confronto
      const isParticipant = Boolean(battle.participants[userId]);
      if (!isParticipant) {
        return res.status(403).render('errors/403', {
          pageTitle: 'Acesso Não Autorizado',
          statusCode: 403,
          message: 'Você não participa deste combate.',
          user: req.session.user
        });
      }

      const playerState = battle.participants[userId];
      const opponentId = Object.keys(battle.participants).find((pid) => pid !== userId);
      const opponentState = battle.participants[opponentId];

      res.render('battle/room', {
        pageTitle: `Duelo Tático — Sala ${id.slice(0, 8)}`,
        battleId: id,
        battleMode: battle.mode,
        turnNumber: battle.turnNumber,
        isMyTurn: battle.activePlayerId === userId,
        player: playerState,
        opponent: opponentState,
        logs: battle.logs || []
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Executa uma ação tática de combate (jogar carta, postura defensiva, etc.).
   * Rota: POST /battle/action
   */
  async action(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { battleId, actionType, cardId } = req.body;

      const result = await BattleService.executeAction(battleId, userId, {
        actionType,
        cardId
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Encerra o turno do combatente ativo, restaurando energia e passando a vez ao oponente.
   * Rota: POST /battle/pass
   */
  async pass(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { battleId } = req.body;

      const battle = BattleService.getBattleState(battleId);
      if (!battle) {
        return res.status(404).json({ success: false, error: 'Batalha não localizada.' });
      }

      if (battle.activePlayerId !== userId) {
        return res.status(403).json({ success: false, error: 'Apenas o jogador ativo pode passar o turno.' });
      }

      const result = await BattleService.passTurn(battleId);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Processa a desistência voluntária do jogador.
   * Rota: POST /battle/concede
   */
  async concede(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { battleId } = req.body;

      const result = await BattleService.concedeBattle(battleId, userId);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Retorna o estado atualizado do combate em formato JSON para requisições assíncronas do frontend.
   * Rota: GET /battle/:id/state
   */
  getState(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.session.user.id;

      const battle = BattleService.getBattleState(id);
      if (!battle) {
        return res.status(404).json({ success: false, error: 'Batalha não encontrada.' });
      }

      const isParticipant = Boolean(battle.participants[userId]);
      if (!isParticipant) {
        return res.status(403).json({ success: false, error: 'Acesso negado.' });
      }

      return res.json({
        success: true,
        battleId: id,
        status: battle.status,
        turnNumber: battle.turnNumber,
        isMyTurn: battle.activePlayerId === userId,
        player: battle.participants[userId],
        opponent: battle.participants[Object.keys(battle.participants).find((pid) => pid !== userId)],
        logs: battle.logs || [],
        rewards: battle.rewards || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a tela de resultado pós-batalha com detalhamento de recompensas e estatísticas.
   * Rota: GET /battle/result/:id
   */
  async result(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.session.user.id;

      const battleRecord = await BattleModel.getBattleWithPlayers(id);
      if (!battleRecord) {
        return res.redirect('/battle');
      }

      const isWinner = battleRecord.winner_id === userId;
      const isDraw = !battleRecord.winner_id;

      // Recupera ações telemétricas registradas no combate para exibição de replay/resumo
      const actions = await BattleModel.getBattleActions(id);

      res.render('battle/result', {
        pageTitle: isWinner ? 'Vitória Tática — Joker RPG' : 'Fim de Combate — Joker RPG',
        battle: battleRecord,
        isWinner,
        isDraw,
        actions,
        currentUserId: userId
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a página de histórico de batalhas disputadas pelo jogador.
   * Rota: GET /history
   */
  async history(req, res, next) {
    try {
      const userId = req.session.user.id;
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = 15;
      const offset = (page - 1) * limit;

      const [historyResult, stats] = await Promise.all([
        BattleModel.getUserBattleHistory(userId, { limit, offset }),
        BattleModel.getUserStats(userId)
      ]);

      const totalPages = Math.ceil(historyResult.total / limit) || 1;

      res.render('history/index', {
        pageTitle: 'Histórico de Confrontos — Joker RPG',
        battles: historyResult.battles,
        pagination: {
          total: historyResult.total,
          totalPages,
          currentPage: page
        },
        stats,
        currentUserId: userId
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = BattleController;