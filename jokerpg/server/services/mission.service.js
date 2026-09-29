/**
 * Joker RPG — Serviço de Missões e Desafios (Mission Service)
 * Coordena o acompanhamento automático de objetivos de combate (vitórias, combos, rupturas),
 * criação administrativa de desafios e distribuição atômica de recompensas de XP e moedas.
 */

const MissionModel = require('../models/mission.model');
const ProgressionService = require('./progression.service');
const { withTransaction } = require('../../database/connection');

const MissionService = {
  /**
   * Retorna todas as missões disponíveis agrupadas com o progresso do jogador.
   * Inicializa o vínculo caso o jogador ainda não possua registros de missões.
   * @param {string} userId - UUID do jogador
   * @returns {Promise<{ daily: Array, battle: Array, progression: Array, totalCompleted: number, totalClaimable: number }>}
   */
  async getUserMissions(userId) {
    let missions = await MissionModel.getUserMissions(userId);

    // Se nenhuma missão estiver vinculada ao usuário, inicializa os registros
    if (missions.length === 0) {
      await MissionModel.initUserMissions(userId);
      missions = await MissionModel.getUserMissions(userId);
    }

    const categorized = {
      daily: [],
      battle: [],
      progression: [],
      totalCompleted: 0,
      totalClaimable: 0
    };

    for (const mission of missions) {
      const isClaimed = Boolean(mission.claimed_at);
      const isCompleted = Boolean(mission.is_completed);

      if (isCompleted) categorized.totalCompleted += 1;
      if (isCompleted && !isClaimed) categorized.totalClaimable += 1;

      const enrichedMission = {
        ...mission,
        progressPercent: Math.min(
          100,
          Math.round((mission.current_progress / mission.requirement_count) * 100)
        ),
        isClaimed
      };

      if (mission.category === 'DAILY') {
        categorized.daily.push(enrichedMission);
      } else if (mission.category === 'BATTLE') {
        categorized.battle.push(enrichedMission);
      } else {
        categorized.progression.push(enrichedMission);
      }
    }

    return categorized;
  },

  /**
   * Dispara o avanço de objetivos com base em eventos de combate e ações táticas.
   * Tipos de requisitos suportados:
   * 'WIN_BATTLES', 'PLAY_CARDS', 'EXECUTE_COMBOS', 'BREAK_POSTURE', 'USE_DEFENSE', 'DEAL_DAMAGE'.
   * @param {string} userId - UUID do jogador
   * @param {string} requirementType - Tipo do objetivo
   * @param {number} [amount=1] - Quantidade a incrementar
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<Array>} Missões que foram concluídas por esse avanço
   */
  async trackProgress(userId, requirementType, amount = 1, client = null) {
    if (!userId || !requirementType) return [];
    const validAmount = Math.max(1, Number(amount) || 1);

    const completedMissions = await MissionModel.incrementProgress(
      userId,
      requirementType,
      validAmount,
      client
    );

    return completedMissions;
  },

  /**
   * Resgata a recompensa de uma missão completada em transação atômica,
   * concedendo o XP e as moedas diretamente à conta do jogador via ProgressionService.
   * @param {string} userId - UUID do jogador
   * @param {string} missionId - UUID da missão
   * @returns {Promise<{ success: boolean, rewardXp: number, rewardCoins: number, missionTitle: string, progression: object }>}
   */
  async claimMissionReward(userId, missionId) {
    return await withTransaction(async (client) => {
      const claimResult = await MissionModel.claimReward(userId, missionId, client);

      if (!claimResult) {
        const error = new Error('Recompensa indisponível. A missão não foi concluída ou já foi resgatada.');
        error.statusCode = 400;
        throw error;
      }

      // Adiciona o XP e as moedas concedidas pela missão
      const progression = await ProgressionService.addProgression(
        userId,
        {
          xp: claimResult.reward_xp,
          coins: claimResult.reward_coins
        },
        client
      );

      return {
        success: true,
        rewardXp: claimResult.reward_xp,
        rewardCoins: claimResult.reward_coins,
        missionTitle: claimResult.title,
        progression
      };
    });
  },

  /**
   * Cria uma nova missão mestre no catálogo do jogo (Operação Administrativa).
   * @param {object} data
   * @returns {Promise<object>} Missão criada
   */
  async createMission(data) {
    return await MissionModel.create({
      title: data.title,
      description: data.description,
      category: data.category,
      requirementType: data.requirement_type,
      requirementCount: parseInt(data.requirement_count, 10),
      rewardXp: parseInt(data.reward_xp, 10) || 0,
      rewardCoins: parseInt(data.reward_coins, 10) || 0
    });
  },

  /**
   * Atualiza as propriedades de uma missão cadastrada.
   * @param {string} id - UUID da missão
   * @param {object} data - Novos valores
   * @returns {Promise<object>} Missão atualizada
   */
  async updateMission(id, data) {
    const existing = await MissionModel.findById(id);
    if (!existing) {
      const error = new Error('Missão não encontrada.');
      error.statusCode = 404;
      throw error;
    }

    return await MissionModel.update(id, {
      title: data.title,
      description: data.description,
      category: data.category,
      requirementType: data.requirement_type,
      requirementCount: data.requirement_count ? parseInt(data.requirement_count, 10) : undefined,
      rewardXp: data.reward_xp !== undefined ? parseInt(data.reward_xp, 10) : undefined,
      rewardCoins: data.reward_coins !== undefined ? parseInt(data.reward_coins, 10) : undefined
    });
  },

  /**
   * Remove logicamente (Soft Delete) uma missão do catálogo ativo.
   * @param {string} id - UUID da missão
   * @returns {Promise<void>}
   */
  async deleteMission(id) {
    const existing = await MissionModel.findById(id);
    if (!existing) {
      const error = new Error('Missão não encontrada.');
      error.statusCode = 404;
      throw error;
    }

    await MissionModel.softDelete(id);
  },

  /**
   * Lista todas as missões cadastradas para o painel de controle administrativo.
   * @param {object} filters
   * @returns {Promise<{ missions: Array, total: number }>}
   */
  async listAllMissions(filters = {}) {
    return await MissionModel.findAll(filters);
  }
};

module.exports = MissionService;