/**
 * Joker RPG — Serviço de Encadeamento de Combos (Combo Service)
 * Avalia transições táticas entre cartas, progressão de multiplicadores
 * de impacto (x2 a x5) e sinergias elementais em sequências de turno.
 */

const { COMBO_RULES, CARD_TYPES } = require('../config/constants');

// Matriz estruturada de regras de transição entre tipos de cartas
const TRANSITION_RULES = Object.freeze({
  [`${CARD_TYPES.ATTACK}->${CARD_TYPES.ATTACK}`]: {
    valid: true,
    bonusDamagePercent: 0.15,
    bonusBreakPercent: 0.05,
    tag: 'CADÊNCIA_FÍSICA'
  },
  [`${CARD_TYPES.ATTACK}->${CARD_TYPES.TECHNIQUE}`]: {
    valid: true,
    bonusDamagePercent: 0.10,
    bonusBreakPercent: 0.25,
    tag: 'RUPTURA_TÁTICA'
  },
  [`${CARD_TYPES.TECHNIQUE}->${CARD_TYPES.ATTACK}`]: {
    valid: true,
    bonusDamagePercent: 0.20,
    bonusBreakPercent: 0.10,
    tag: 'REPRESÁLIA_FLUIDA'
  },
  [`${CARD_TYPES.TECHNIQUE}->${CARD_TYPES.SPECIAL}`]: {
    valid: true,
    bonusDamagePercent: 0.25,
    bonusBreakPercent: 0.20,
    tag: 'CONVERGÊNCIA_DE_PODER'
  },
  [`${CARD_TYPES.ATTACK}->${CARD_TYPES.SPECIAL}`]: {
    valid: true,
    bonusDamagePercent: 0.20,
    bonusBreakPercent: 0.15,
    tag: 'DESFECHO_ESPECIAL'
  },
  [`${CARD_TYPES.SPECIAL}->${CARD_TYPES.ULTIMATE}`]: {
    valid: true,
    bonusDamagePercent: 0.35,
    bonusBreakPercent: 0.30,
    tag: 'CATACLISMO_FINAL'
  },
  [`${CARD_TYPES.DEFENSE}->COUNTER`]: {
    valid: true,
    bonusDamagePercent: 0.30,
    bonusBreakPercent: 0.20,
    tag: 'CONTRA_GOLPE_PERFEITO'
  }
});

const ComboService = {
  /**
   * Retorna o multiplicador de dano acumulado baseado na contagem de combo.
   * @param {number} comboStreak - Número de golpes consecutivos (1 a 5)
   * @returns {number}
   */
  getComboMultiplier(comboStreak) {
    const streak = Math.max(1, Math.min(COMBO_RULES.MAX_COMBO_STREAK, Number(comboStreak) || 1));
    return COMBO_RULES.MULTIPLIERS[streak] || 1.0;
  },

  /**
   * Avalia a sinergia elemental entre duas cartas jogadas sequencialmente.
   * @param {object|null} previousCard
   * @param {object|null} currentCard
   * @returns {{ isSynergistic: boolean, elementalMultiplier: number, tag: string|null }}
   */
  isElementalCombo(previousCard, currentCard) {
    if (!previousCard || !currentCard || !previousCard.element || !currentCard.element) {
      return { isSynergistic: false, elementalMultiplier: 1.0, tag: null };
    }

    if (previousCard.element === currentCard.element) {
      return {
        isSynergistic: true,
        elementalMultiplier: 1.20,
        tag: `RESSONÂNCIA_${currentCard.element}`
      };
    }

    // Combinações híbridas especiais
    if (
      (previousCard.element === 'FIRE' && currentCard.element === 'WIND') ||
      (previousCard.element === 'WIND' && currentCard.element === 'FIRE')
    ) {
      return { isSynergistic: true, elementalMultiplier: 1.25, tag: 'TEMPESTADE_DE_CHAMAS' };
    }

    if (
      (previousCard.element === 'WATER' && currentCard.element === 'LIGHTNING') ||
      (previousCard.element === 'LIGHTNING' && currentCard.element === 'WATER')
    ) {
      return { isSynergistic: true, elementalMultiplier: 1.30, tag: 'CONDUÇÃO_ELETRO_AQUÁTICA' };
    }

    return { isSynergistic: false, elementalMultiplier: 1.0, tag: null };
  },

  /**
   * Avalia se a transição entre a última ação e a atual configura uma cadeia de combo.
   * @param {string|null} lastActionType - Tipo da última ação executada na rodada
   * @param {string} currentActionType - Tipo da ação atual
   * @param {number} [currentComboCount=0] - Contagem de combo acumulada na rodada
   * @returns {{ isValidCombo: boolean, newStreak: number, bonusDamagePercent: number, bonusBreakPercent: number, tag: string }}
   */
  evaluateCombo(lastActionType, currentActionType, currentComboCount = 0) {
    if (!lastActionType) {
      return {
        isValidCombo: false,
        newStreak: 1,
        bonusDamagePercent: 0,
        bonusBreakPercent: 0,
        tag: 'INÍCIO_DE_CADÊNCIA'
      };
    }

    const transitionKey = `${lastActionType}->${currentActionType}`;
    const rule = TRANSITION_RULES[transitionKey];

    if (rule && rule.valid) {
      const newStreak = Math.min(COMBO_RULES.MAX_COMBO_STREAK, currentComboCount + 1);
      return {
        isValidCombo: true,
        newStreak,
        bonusDamagePercent: rule.bonusDamagePercent,
        bonusBreakPercent: rule.bonusBreakPercent,
        tag: rule.tag
      };
    }

    // Caso a ação seja ofensiva mas não mapeada na matriz exata, mantém avanço linear simples
    const offensiveActions = [CARD_TYPES.ATTACK, CARD_TYPES.TECHNIQUE, CARD_TYPES.SPECIAL, CARD_TYPES.ULTIMATE];
    if (offensiveActions.includes(lastActionType) && offensiveActions.includes(currentActionType)) {
      const newStreak = Math.min(COMBO_RULES.MAX_COMBO_STREAK, currentComboCount + 1);
      return {
        isValidCombo: true,
        newStreak,
        bonusDamagePercent: 0.05,
        bonusBreakPercent: 0.05,
        tag: 'SEQUÊNCIA_CONTINUA'
      };
    }

    return {
      isValidCombo: false,
      newStreak: 1,
      bonusDamagePercent: 0,
      bonusBreakPercent: 0,
      tag: 'REINÍCIO_DE_RITMO'
    };
  },

  /**
   * Atualiza e persiste em memória o estado de combo do combatente ativo.
   * @param {object} playerState - Estado do duelista
   * @param {string} actionType - Ação executada
   * @param {object|null} [card=null] - Carta jogada
   * @returns {object} Resultado detalhado do combo avaliado
   */
  updateComboState(playerState, actionType, card = null) {
    if (!playerState) {
      throw new Error('Estado do jogador inválido para avaliação de combo.');
    }

    const lastAction = playerState.lastActionType || null;
    const lastCard = playerState.lastCardPlayed || null;
    const currentCount = playerState.comboCounter || 0;

    const evaluation = this.evaluateCombo(lastAction, actionType, currentCount);
    const elementalEvaluation = this.isElementalCombo(lastCard, card);

    playerState.comboCounter = evaluation.newStreak;
    playerState.lastActionType = actionType;
    playerState.lastCardPlayed = card;

    const baseMultiplier = this.getComboMultiplier(evaluation.newStreak);
    const totalMultiplier = baseMultiplier * elementalEvaluation.elementalMultiplier;

    return {
      streak: evaluation.newStreak,
      multiplier: Number(totalMultiplier.toFixed(2)),
      bonusDamagePercent: evaluation.bonusDamagePercent,
      bonusBreakPercent: evaluation.bonusBreakPercent,
      isElementalCombo: elementalEvaluation.isSynergistic,
      tag: elementalEvaluation.tag || evaluation.tag,
      label: evaluation.newStreak > 1 ? `COMBO x${evaluation.newStreak}` : null
    };
  },

  /**
   * Reseta a contagem de combo do combatente (acionado ao fim de turno ou quebra de ritmo).
   * @param {object} playerState
   */
  resetCombo(playerState) {
    if (!playerState) return;
    playerState.comboCounter = 0;
    playerState.lastActionType = null;
    playerState.lastCardPlayed = null;
  }
};

module.exports = ComboService;