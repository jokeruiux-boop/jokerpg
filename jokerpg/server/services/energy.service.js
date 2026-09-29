/**
 * Joker RPG — Serviço de Gerenciamento de Energia Tática (Energy Service)
 * Valida custos de cartas e habilidades, controla o consumo por turno e calcula a recuperação passiva.
 */

const { COMBAT_RULES, CARD_TYPES } = require('../config/constants');

const EnergyService = {
  /**
   * Determina o custo de energia regulamentar de uma ação ou carta.
   * @param {string} actionType - Tipo da ação (ATTACK, DEFENSE, TECHNIQUE, SPECIAL, ULTIMATE, BLOCK, DODGE, etc.)
   * @param {object|null} card - Carta associada à ação, se houver
   * @returns {number}
   */
  getActionEnergyCost(actionType, card = null) {
    if (card && typeof card.energy_cost === 'number') {
      return Math.max(0, card.energy_cost);
    }

    switch (actionType) {
      case 'ATTACK':
        return 1;
      case 'TECHNIQUE':
        return 2;
      case 'SPECIAL':
        return 3;
      case 'ULTIMATE':
        return 5;
      case 'BLOCK':
        return 1;
      case 'DODGE':
        return 1;
      case 'COUNTER':
        return 2;
      case 'PASS':
        return 0;
      default:
        return 1;
    }
  },

  /**
   * Verifica se o combatente possui energia suficiente para executar a ação desejada.
   * @param {number} currentEnergy - Quantidade atual de energia do jogador
   * @param {number} requiredEnergy - Custo exigido pela carta ou manobra
   * @returns {boolean}
   */
  hasEnoughEnergy(currentEnergy, requiredEnergy) {
    const current = Number(currentEnergy) || 0;
    const required = Number(requiredEnergy) || 0;
    return current >= required;
  },

  /**
   * Deduz o custo de energia da reserva do combatente, garantindo piso zero.
   * @param {number} currentEnergy - Energia disponível antes do consumo
   * @param {number} energyCost - Custo a ser subtraído
   * @returns {number} Energia restante
   */
  consumeEnergy(currentEnergy, energyCost) {
    const current = Number(currentEnergy) || 0;
    const cost = Number(energyCost) || 0;
    return Math.max(0, current - cost);
  },

  /**
   * Calcula a recuperação de energia no início de cada nova rodada.
   * @param {number} currentEnergy - Quantidade atual de energia
   * @param {number} [maxEnergy=COMBAT_RULES.MAX_ENERGY] - Teto máximo configurado
   * @param {number} [recoveryBonus=0] - Bônus passivo derivado de classes ou status
   * @returns {number} Nova quantidade de energia após a regeneração
   */
  recoverEnergyPerTurn(currentEnergy, maxEnergy = COMBAT_RULES.MAX_ENERGY, recoveryBonus = 0) {
    const current = Number(currentEnergy) || 0;
    const baseRecovery = COMBAT_RULES.ENERGY_RECOVERY_PER_TURN;
    const totalRecovery = baseRecovery + (Number(recoveryBonus) || 0);

    return Math.min(maxEnergy, current + totalRecovery);
  },

  /**
   * Valida a viabilidade energética da jogada e deduz o custo diretamente do estado do jogador.
   * Lança erro com mensagem tática caso a energia seja insuficiente.
   * @param {object} playerState - Estado do combatente na partida
   * @param {string} actionType - Tipo da ação realizada
   * @param {object|null} [card=null] - Carta utilizada
   * @returns {{ success: boolean, cost: number, remainingEnergy: number }}
   */
  validateAndDeduct(playerState, actionType, card = null) {
    if (!playerState) {
      throw new Error('Estado do jogador inválido para verificação de energia.');
    }

    const cost = this.getActionEnergyCost(actionType, card);

    if (!this.hasEnoughEnergy(playerState.energy, cost)) {
      throw new Error(`Energia insuficiente. Ação '${actionType}' requer ${cost} ponto(s) de energia (disponível: ${playerState.energy}).`);
    }

    playerState.energy = this.consumeEnergy(playerState.energy, cost);

    return {
      success: true,
      cost,
      remainingEnergy: playerState.energy
    };
  }
};

module.exports = EnergyService;