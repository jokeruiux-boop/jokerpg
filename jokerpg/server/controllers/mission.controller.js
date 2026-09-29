/**
 * Joker RPG — Controlador de Missões e Objetivos (Mission Controller)
 * Gerencia o painel de desafios diários, de combate e progressão,
 * além do resgate seguro e autoritativo de recompensas em XP e moedas.
 */

const MissionService = require('../services/mission.service');

const MissionController = {
  /**
   * Renderiza a central de missões do jogador, organizada por categorias
   * (Diárias, Batalha e Progressão Geral) com suas barras de conclusão.
   * Rota: GET /missions
   */
  async index(req, res, next) {
    try {
      const userId = req.session.user.id;
      const missionsData = await MissionService.getUserMissions(userId);

      const successParam = req.query.success;
      let successMessage = null;

      if (successParam === 'reward_claimed') {
        successMessage = 'Recompensa resgatada com sucesso! XP e moedas foram adicionados à sua conta.';
      }

      res.render('missions/index', {
        pageTitle: 'Quadro de Missões e Desafios — Joker RPG',
        dailyMissions: missionsData.daily,
        battleMissions: missionsData.battle,
        progressionMissions: missionsData.progression,
        totalCompleted: missionsData.totalCompleted,
        totalClaimable: missionsData.totalClaimable,
        successMessage,
        errorMessage: req.query.error || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa o resgate de recompensa de uma missão completada.
   * Rota: POST /missions/:id/claim
   */
  async claim(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { id } = req.params;

      const claimResult = await MissionService.claimMissionReward(userId, id);

      // Atualiza os dados de nível e moedas refletidos na sessão ativa
      if (claimResult.progression) {
        req.session.user.level = claimResult.progression.newLevel;
        req.session.user.coins = claimResult.progression.newCoins;
        req.session.save();
      }

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: `Recompensa da missão '${claimResult.missionTitle}' resgatada com sucesso!`,
          rewardXp: claimResult.rewardXp,
          rewardCoins: claimResult.rewardCoins,
          progression: claimResult.progression
        });
      }

      return res.redirect('/missions?success=reward_claimed');
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

module.exports = MissionController;