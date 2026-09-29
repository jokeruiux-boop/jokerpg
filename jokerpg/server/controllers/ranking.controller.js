/**
 * Joker RPG — Controlador de Classificações e Temporadas (Ranking Controller)
 * Gerencia a visualização do quadro de honra de combatentes (Leaderboards),
 * filtragem por critérios de rating, poder, vitórias e temporadas competitivas.
 */

const RankingModel = require('../models/ranking.model');

const RankingController = {
  /**
   * Renderiza a tabela de classificação oficial de jogadores.
   * Rota: GET /ranking
   */
  async index(req, res, next) {
    try {
      const userId = req.session.user.id;
      const {
        sortBy = 'rating',
        seasonId = null,
        page = 1
      } = req.query;

      const pageNumber = Math.max(1, parseInt(page, 10) || 1);
      const limit = 20;
      const offset = (pageNumber - 1) * limit;

      // Executa consultas concorrentes da classificação, temporada ativa e lista de temporadas
      const [
        rankingData,
        userRank,
        currentSeason,
        allSeasons
      ] = await Promise.all([
        seasonId
          ? RankingModel.getSeasonRanking(seasonId, { limit, offset })
          : RankingModel.getGlobalRanking({ limit, offset, sortBy }),
        RankingModel.getUserRanking(userId, seasonId || null),
        RankingModel.getCurrentActiveSeason(),
        RankingModel.getAllSeasons()
      ]);

      const totalPages = Math.ceil(rankingData.total / limit) || 1;

      res.render('ranking/index', {
        pageTitle: 'Quadro de Honra e Classificação — Joker RPG',
        leaderboard: rankingData.leaderboard,
        userRank,
        currentSeason,
        allSeasons,
        currentSeasonId: seasonId || '',
        currentSort: sortBy,
        pagination: {
          total: rankingData.total,
          totalPages,
          currentPage: pageNumber
        },
        currentUserId: userId
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = RankingController;