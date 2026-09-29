/**
 * Joker RPG — Serviço de Progressão, Níveis e Recompensas (Progression Service)
 * Orquestra fórmulas de curva de XP, subida de níveis de conta e personagens,
 * concessão de moedas e consolidação atômica de recompensas de combate.
 */

const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const RankingModel = require('../models/ranking.model');
const PowerService = require('./power.service');
const { withTransaction } = require('../../database/connection');

const ProgressionService = {
  /**
   * Calcula a quantidade de experiência exigida para transitar do nível atual para o próximo.
   * Fórmula progressiva não linear: Nível * 250 + (Nível² * 40)
   * @param {number} level - Nível atual
   * @returns {number} Quantidade total de XP exigida
   */
  getXpRequiredForNextLevel(level) {
    const currentLvl = Math.max(1, Number(level) || 1);
    return Math.round((currentLvl * 250) + (Math.pow(currentLvl, 2) * 40));
  },

  /**
   * Adiciona experiência e moedas à conta de um combatente com cálculo autoritativo de level-up.
   * Suporta subida consecutiva de múltiplos níveis e transações atômicas no banco.
   * @param {string} userId - UUID do jogador
   * @param {object} rewards
   * @param {number} [rewards.xp=0] - XP a conceder
   * @param {number} [rewards.coins=0] - Moedas a conceder
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<{ leveledUp: boolean, oldLevel: number, newLevel: number, newXp: number, newCoins: number, levelsGained: number }>}
   */
  async addProgression(userId, { xp = 0, coins = 0 }, client = null) {
    const user = await UserModel.findById(userId, client);
    if (!user) {
      throw new Error(`Jogador ${userId} não encontrado para consolidação de progressão.`);
    }

    let currentLevel = Number(user.level) || 1;
    let currentXp = (Number(user.xp) || 0) + Math.max(0, Number(xp) || 0);
    const newCoins = (Number(user.coins) || 0) + Math.max(0, Number(coins) || 0);
    const initialLevel = currentLevel;

    // Loop de avaliação contínua de level-up
    let requiredXp = this.getXpRequiredForNextLevel(currentLevel);
    while (currentXp >= requiredXp) {
      currentXp -= requiredXp;
      currentLevel += 1;
      requiredXp = this.getXpRequiredForNextLevel(currentLevel);
    }

    const leveledUp = currentLevel > initialLevel;
    const levelsGained = currentLevel - initialLevel;

    // Atualiza progressão no banco de dados
    await UserModel.updateProgression(
      userId,
      {
        level: currentLevel,
        xp: currentXp,
        coins: newCoins,
        powerIndex: user.power_index
      },
      client
    );

    // Se houve level-up, recalcula o índice de poder global do combatente
    if (leveledUp) {
      await PowerService.recalculateAndPersistUserPower(userId, client);
    }

    return {
      leveledUp,
      oldLevel: initialLevel,
      newLevel: currentLevel,
      newXp: currentXp,
      newCoins,
      levelsGained
    };
  },

  /**
   * Adiciona experiência específica a um personagem do jogador, evoluindo seus atributos de combate.
   * @param {string} userId - UUID do jogador
   * @param {string} characterId - UUID do combatente
   * @param {number} xpToAdd - Experiência ganha pelo personagem
   * @param {object} [client]
   * @returns {Promise<{ leveledUp: boolean, newLevel: number, newXp: number }>}
   */
  async addCharacterXp(userId, characterId, xpToAdd, client = null) {
    const exec = client ? client.query.bind(client) : null;
    const sql = `
      SELECT id, level, xp 
      FROM user_characters 
      WHERE user_id = $1 AND character_id = $2 
      LIMIT 1;
    `;
    const { rows } = exec
      ? await exec(sql, [userId, characterId])
      : await require('../../database/connection').query(sql, [userId, characterId]);

    if (rows.length === 0) {
      return { leveledUp: false, newLevel: 1, newXp: 0 };
    }

    let charLevel = Number(rows[0].level) || 1;
    let charXp = (Number(rows[0].xp) || 0) + Math.max(0, Number(xpToAdd) || 0);
    const initialCharLevel = charLevel;

    let requiredXp = this.getXpRequiredForNextLevel(charLevel);
    while (charXp >= requiredXp) {
      charXp -= requiredXp;
      charLevel += 1;
      requiredXp = this.getXpRequiredForNextLevel(charLevel);
    }

    await CharacterModel.updateUserCharacterLevel(
      userId,
      characterId,
      { level: charLevel, xp: charXp },
      client
    );

    const leveledUp = charLevel > initialCharLevel;
    if (leveledUp) {
      await PowerService.recalculateAndPersistUserPower(userId, client);
    }

    return {
      leveledUp,
      newLevel: charLevel,
      newXp: charXp
    };
  },

  /**
   * Processa de forma autoritativa e atômica todas as recompensas de fim de partida para ambos os combatentes.
   * Inclui: XP, moedas, XP de personagem e ajuste de pontuação de ranking (ELO/Rating).
   * @param {object} params
   * @param {string} params.winnerId - UUID do vencedor
   * @param {string|null} params.loserId - UUID do derrotado (se houver, ex: duelo PvP)
   * @param {string} params.mode - Modo de combate ('PVE_TRAINING', 'PVP_CASUAL', 'PVP_RANKED')
   * @param {number} [params.totalTurns=1] - Duração da partida em turnos
   * @param {string|null} [params.winnerCharId=null] - Personagem do vencedor
   * @param {string|null} [params.loserCharId=null] - Personagem do perdedor
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<{ winnerRewards: object, loserRewards: object|null }>}
   */
  async processBattleEndRewards({
    winnerId,
    loserId = null,
    mode,
    totalTurns = 1,
    winnerCharId = null,
    loserCharId = null
  }, client = null) {
    const isRanked = mode === 'PVP_RANKED';

    // Definição de recompensas base
    let winnerXp = isRanked ? 180 : 120;
    let winnerCoins = isRanked ? 80 : 50;
    let loserXp = isRanked ? 50 : 30;
    let loserCoins = isRanked ? 25 : 15;

    // Bônus tático por agilidade na vitória (menos de 6 turnos)
    if (totalTurns <= 6) {
      winnerXp += 30;
      winnerCoins += 20;
    }

    const winnerRatingDelta = isRanked ? 25 : 10;
    const loserRatingDelta = isRanked ? -20 : -5;

    // 1. Processa Recompensas do Vencedor
    const winnerProgression = await this.addProgression(
      winnerId,
      { xp: winnerXp, coins: winnerCoins },
      client
    );

    if (winnerCharId) {
      await this.addCharacterXp(winnerId, winnerCharId, Math.round(winnerXp * 0.8), client);
    }

    await RankingModel.upsertRanking({
      userId: winnerId,
      ratingDelta: winnerRatingDelta,
      isWin: true,
      powerIndex: 0
    }, client);

    const result = {
      winnerRewards: {
        xpGained: winnerXp,
        coinsGained: winnerCoins,
        ratingDelta: winnerRatingDelta,
        progression: winnerProgression
      },
      loserRewards: null
    };

    // 2. Processa Recompensas do Perdedor (se aplicável)
    if (loserId) {
      const loserProgression = await this.addProgression(
        loserId,
        { xp: loserXp, coins: loserCoins },
        client
      );

      if (loserCharId) {
        await this.addCharacterXp(loserId, loserCharId, Math.round(loserXp * 0.5), client);
      }

      await RankingModel.upsertRanking({
        userId: loserId,
        ratingDelta: loserRatingDelta,
        isWin: false,
        powerIndex: 0
      }, client);

      result.loserRewards = {
        xpGained: loserXp,
        coinsGained: loserCoins,
        ratingDelta: loserRatingDelta,
        progression: loserProgression
      };
    }

    return result;
  }
};

module.exports = ProgressionService;