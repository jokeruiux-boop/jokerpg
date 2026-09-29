/**
 * Joker RPG — Controlador da Central do Jogador (Dashboard Controller)
 * Agrega e fornece métricas de progressão, herói principal em destaque,
 * baralho tático ativo, resumo de missões, histórico recente e status de ranking.
 */

const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const DeckModel = require('../models/deck.model');
const CardModel = require('../models/card.model');
const BattleModel = require('../models/battle.model');
const RankingModel = require('../models/ranking.model');
const ProgressionService = require('../services/progression.service');
const MissionService = require('../services/mission.service');

const DashboardController = {
  /**
   * Renderiza a visão principal do jogador com todos os dados consolidados.
   * Rota: GET /dashboard
   */
  async index(req, res, next) {
    try {
      const userId = req.session.user.id;

      // 1. Carrega dados atualizados do usuário e personagem principal
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.redirect('/auth/login');
      }

      // 2. Calcula métricas de XP e barra de progressão percentual
      const requiredXp = ProgressionService.getXpRequiredForNextLevel(user.level);
      const xpProgressPercent = Math.min(
        100,
        Math.round(((user.xp || 0) / requiredXp) * 100)
      );

      // 3. Carrega o baralho atualmente configurado como ativo
      const activeDeck = await DeckModel.findActiveByUserId(userId);

      // 4. Executa consultas paralelas para coletar dados auxiliares da central
      const [
        userRanking,
        recentBattlesResult,
        missionsOverview,
        userCards,
        userCharacters
      ] = await Promise.all([
        RankingModel.getUserRanking(userId),
        BattleModel.getUserBattleHistory(userId, { limit: 5 }),
        MissionService.getUserMissions(userId),
        CardModel.getUserCards(userId),
        CharacterModel.findUserCharacters(userId)
      ]);

      res.render('dashboard/index', {
        pageTitle: 'Quartel-General — Joker RPG',
        user: {
          ...user,
          requiredXp,
          xpProgressPercent
        },
        ranking: userRanking || {
          rating: 1000,
          rank_position: 'N/A',
          wins: 0,
          losses: 0
        },
        activeDeck,
        recentBattles: recentBattlesResult.battles || [],
        missions: missionsOverview,
        totalCardsOwned: userCards.reduce((acc, c) => acc + (c.quantity || 1), 0),
        totalCharactersOwned: userCharacters.length
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = DashboardController;