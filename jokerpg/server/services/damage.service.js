/**
 * Joker RPG — Serviço Central de Cálculo de Dano e Ruptura de Postura (Damage Service)
 * Orquestra a fórmula matemática autoritativa de combate:
 * Dano Base, Mitigação de Defesa, Afinidade Elemental, Golpe Crítico,
 * Multiplicadores de Combo, Estado de Break e Posturas Defensivas (Block, Dodge, Counter, Barrier).
 */

const { ELEMENTAL_ADVANTAGE, COMBAT_RULES, DEFENSIVE_STANCES } = require('../config/constants');
const StatusService = require('./status.service');

const DamageService = {
  /**
   * Obtém o modificador de afinidade elemental entre atacante e defensor.
   * @param {string} attackerElement - Elemento da carta ou atacante
   * @param {string} defenderElement - Elemento do defensor
   * @returns {number} Multiplicador (0.75 a 1.35)
   */
  getElementalModifier(attackerElement, defenderElement) {
    if (!attackerElement || !defenderElement) return 1.0;
    const attackerMatrix = ELEMENTAL_ADVANTAGE[attackerElement];
    if (attackerMatrix && attackerMatrix[defenderElement] !== undefined) {
      return attackerMatrix[defenderElement];
    }
    return 1.0;
  },

  /**
   * Determina de forma pseudoaleatória autoritativa se o golpe foi um acerto crítico.
   * @param {number} criticalChance - Percentual de chance crítica (0 a 100)
   * @returns {boolean}
   */
  rollCritical(criticalChance) {
    const chance = Math.max(0, Math.min(100, Number(criticalChance) || 0));
    const roll = Math.random() * 100;
    return roll <= chance;
  },

  /**
   * Calcula o dano de quebra de postura (Break Gauge) causado ao defensor.
   * @param {number} baseCardBreak - Quebra base da carta
   * @param {number} attackerAttack - Atributo de ataque do atacante
   * @param {number} elementalMod - Modificador elemental
   * @param {object} defenderState - Estado atual do defensor
   * @param {number} [bonusBreakPercent=0] - Bônus derivado de combos
   * @returns {number} Dano de postura final
   */
  calculateBreakDamage(baseCardBreak, attackerAttack, elementalMod, defenderState, bonusBreakPercent = 0) {
    // Alvos que já estão em estado de Break não sofrem quebra adicional
    if (defenderState.isBroken) return 0;

    const baseBreak = Number(baseCardBreak) || 10;
    const attackFactor = 1 + (Number(attackerAttack) / 400);
    const breakMultiplier = (elementalMod > 1.0) ? 1.25 : 1.0;
    const comboFactor = 1 + (Number(bonusBreakPercent) || 0);

    const totalBreak = Math.round(baseBreak * attackFactor * breakMultiplier * comboFactor);
    return Math.max(5, totalBreak);
  },

  /**
   * Avalia a postura defensiva ativa do alvo contra o impacto iminente.
   * Processa: BLOCK (redução), DODGE (evasão total), COUNTER (mitigação e contra-ataque) ou BARRIER.
   * @param {object} defenderState - Estado do defensor
   * @param {number} rawDamage - Dano pré-mitigação
   * @param {number} rawBreak - Dano de Break pré-mitigação
   * @returns {{ finalDamage: number, finalBreak: number, isDodged: boolean, isBlocked: boolean, isCountered: boolean, counterDamage: number, logMessage: string|null }}
   */
  processDefensiveStance(defenderState, rawDamage, rawBreak) {
    const stance = defenderState.defensiveStance || DEFENSIVE_STANCES.NONE;

    // Alvos em estado de Break perdem a capacidade de reagir com posturas defensivas
    if (defenderState.isBroken || stance === DEFENSIVE_STANCES.NONE) {
      return {
        finalDamage: rawDamage,
        finalBreak: rawBreak,
        isDodged: false,
        isBlocked: false,
        isCountered: false,
        counterDamage: 0,
        logMessage: null
      };
    }

    // 1. Postura de Esquiva (DODGE)
    if (stance === DEFENSIVE_STANCES.DODGE) {
      defenderState.defensiveStance = DEFENSIVE_STANCES.NONE;
      const speed = Number(defenderState.speed) || 50;
      const dodgeChance = Math.min(
        COMBAT_RULES.DODGE_MAX_CHANCE,
        COMBAT_RULES.DODGE_BASE_CHANCE + (speed / 300)
      );

      if (Math.random() <= dodgeChance) {
        return {
          finalDamage: 0,
          finalBreak: 0,
          isDodged: true,
          isBlocked: false,
          isCountered: false,
          counterDamage: 0,
          logMessage: 'ESQUIVA PERFEITA! O defensor evadiu totalmente o ataque.'
        };
      } else {
        return {
          finalDamage: rawDamage,
          finalBreak: rawBreak,
          isDodged: false,
          isBlocked: false,
          isCountered: false,
          counterDamage: 0,
          logMessage: 'FALHA NA ESQUIVA! O golpe atingiu o defensor em movimento.'
        };
      }
    }

    // 2. Postura de Bloqueio (BLOCK)
    if (stance === DEFENSIVE_STANCES.BLOCK) {
      defenderState.defensiveStance = DEFENSIVE_STANCES.NONE;
      const defenseStat = Number(defenderState.defense) || 50;
      const reductionRate = Math.min(0.80, COMBAT_RULES.BLOCK_BASE_REDUCTION + (defenseStat / 500));

      const reducedDamage = Math.round(rawDamage * (1 - reductionRate));
      const reducedBreak = Math.round(rawBreak * 0.50);

      return {
        finalDamage: Math.max(1, reducedDamage),
        finalBreak: Math.max(0, reducedBreak),
        isDodged: false,
        isBlocked: true,
        isCountered: false,
        counterDamage: 0,
        logMessage: `BLOQUEIO FIRME! Dano mitigado em ${Math.round(reductionRate * 100)}%.`
      };
    }

    // 3. Postura de Contra-Ataque (COUNTER)
    if (stance === DEFENSIVE_STANCES.COUNTER) {
      defenderState.defensiveStance = DEFENSIVE_STANCES.NONE;
      const reducedDamage = Math.round(rawDamage * (1 - COMBAT_RULES.COUNTER_BASE_DAMAGE_REDUCTION));
      const counterDmg = Math.round(rawDamage * COMBAT_RULES.COUNTER_BASE_DAMAGE_REFLECT);

      return {
        finalDamage: Math.max(1, reducedDamage),
        finalBreak: Math.max(0, rawBreak),
        isDodged: false,
        isBlocked: false,
        isCountered: true,
        counterDamage: counterDmg,
        logMessage: `RIPOSTAGEM! Dano atenuado e contra-ataque automático desferido (-${counterDmg} HP ao agressor).`
      };
    }

    // 4. Barreira de Proteção (BARRIER)
    if (stance === DEFENSIVE_STANCES.BARRIER) {
      const barrierHp = Number(defenderState.barrierHp) || 150;
      if (barrierHp >= rawDamage) {
        defenderState.barrierHp -= rawDamage;
        return {
          finalDamage: 0,
          finalBreak: 0,
          isDodged: false,
          isBlocked: true,
          isCountered: false,
          counterDamage: 0,
          logMessage: `BARREIRA ABSORVEU O IMPACTO! (Restante: ${defenderState.barrierHp} HP)`
        };
      } else {
        const remainingDamage = rawDamage - barrierHp;
        defenderState.barrierHp = 0;
        defenderState.defensiveStance = DEFENSIVE_STANCES.NONE;
        return {
          finalDamage: remainingDamage,
          finalBreak: Math.round(rawBreak * 0.70),
          isDodged: false,
          isBlocked: true,
          isCountered: false,
          counterDamage: 0,
          logMessage: 'BARREIRA DESTRUÍDA! Dano residual ultrapassou as defesas.'
        };
      }
    }

    return {
      finalDamage: rawDamage,
      finalBreak: rawBreak,
      isDodged: false,
      isBlocked: false,
      isCountered: false,
      counterDamage: 0,
      logMessage: null
    };
  },

  /**
   * Executa a fórmula principal de combate entre atacante e defensor.
   * @param {object} params
   * @param {object} params.attackerState - Estado de combate do atacante
   * @param {object} params.defenderState - Estado de combate do defensor
   * @param {object|null} params.card - Carta jogada
   * @param {string} params.actionType - Tipo da manobra executada
   * @param {object} [params.comboResult] - Metadados de combo avaliados pelo ComboService
   * @returns {object} Resumo estruturado do cálculo de dano
   */
  calculateAttackDamage({
    attackerState,
    defenderState,
    card = null,
    actionType,
    comboResult = { multiplier: 1.0, bonusDamagePercent: 0, bonusBreakPercent: 0 }
  }) {
    if (!attackerState || !defenderState) {
      throw new Error('Estados de atacante e defensor obrigatórios para cálculo de dano.');
    }

    // Coleta e cálculo dos multiplicadores de status (Buffs / Debuffs)
    const attackerMods = StatusService.getStatModifiers(attackerState);
    const defenderMods = StatusService.getStatModifiers(defenderState);

    const baseCardDamage = card ? (Number(card.damage) || 0) : 50;
    const baseCardBreak = card ? (Number(card.break_damage) || 10) : 10;
    const cardElement = card ? card.element : attackerState.element;

    const effectiveAttack = (Number(attackerState.attack) || 60) * attackerMods.attackMultiplier;
    // Em estado de Break, a defesa base é zerada
    const effectiveDefense = defenderState.isBroken
      ? 0
      : (Number(defenderState.defense) || 40) * defenderMods.defenseMultiplier;

    // 1. Dano Base Escalonado pelo Ataque
    const scaledBaseDamage = baseCardDamage * (effectiveAttack / 75);

    // 2. Fator de Redução pela Defesa
    const defenseMitigationFactor = 1 - (effectiveDefense / (effectiveDefense + 180));

    // 3. Modificador Elemental
    const elementalMultiplier = this.getElementalModifier(cardElement, defenderState.element);

    // 4. Modificador de Combo
    const comboMultiplier = Number(comboResult.multiplier) || 1.0;
    const comboBonusMultiplier = 1 + (Number(comboResult.bonusDamagePercent) || 0);

    // 5. Teste e Modificador de Golpe Crítico
    const critChance = Number(attackerState.critical_chance) || 5.0;
    const wasCritical = this.rollCritical(critChance);
    const criticalMultiplier = wasCritical ? COMBAT_RULES.BASE_CRITICAL_MULTIPLIER : 1.0;

    // 6. Vulnerabilidade por Break (Alvo quebrado sofre +50% de dano adicional)
    const breakMultiplier = defenderState.isBroken ? COMBAT_RULES.BREAK_DAMAGE_MULTIPLIER : 1.0;

    // Cálculo do Dano Bruto antes das defesas ativas
    const rawDamage = Math.round(
      scaledBaseDamage *
      defenseMitigationFactor *
      elementalMultiplier *
      comboMultiplier *
      comboBonusMultiplier *
      criticalMultiplier *
      breakMultiplier
    );

    // Cálculo da Ruptura de Postura Bruta
    const rawBreak = this.calculateBreakDamage(
      baseCardBreak,
      effectiveAttack,
      elementalMultiplier,
      defenderState,
      comboResult.bonusBreakPercent
    );

    // 7. Avaliação das Posturas Defensivas do Alvo (Block, Dodge, Counter, Barrier)
    const defenseOutcome = this.processDefensiveStance(defenderState, rawDamage, rawBreak);

    return {
      damageDealt: Math.max(0, defenseOutcome.finalDamage),
      breakDealt: Math.max(0, defenseOutcome.finalBreak),
      wasCritical,
      isDodged: defenseOutcome.isDodged,
      isBlocked: defenseOutcome.isBlocked,
      isCountered: defenseOutcome.isCountered,
      counterDamage: defenseOutcome.counterDamage,
      isBrokenTarget: defenderState.isBroken,
      elementalMultiplier,
      comboMultiplier,
      defenseLog: defenseOutcome.logMessage
    };
  },

  /**
   * Aplica diretamente o resultado de dano e quebra de postura ao estado do defensor.
   * Gerencia transições para o estado de BREAK! e atualizações de vida.
   * @param {object} defenderState - Estado do defensor
   * @param {object} damageResult - Objeto retornado por calculateAttackDamage
   * @returns {{ newHp: number, newBreak: number, didEnterBreak: boolean }}
   */
  applyDamageAndBreak(defenderState, damageResult) {
    if (!defenderState) {
      throw new Error('Estado do defensor inválido para aplicação de dano.');
    }

    let didEnterBreak = false;

    // Aplicação na Barra de HP
    defenderState.hp = Math.max(0, defenderState.hp - damageResult.damageDealt);

    // Aplicação na Barra de Break (Postura)
    if (!defenderState.isBroken && damageResult.breakDealt > 0) {
      defenderState.breakGauge = Math.max(0, defenderState.breakGauge - damageResult.breakDealt);

      if (defenderState.breakGauge <= 0) {
        defenderState.isBroken = true;
        defenderState.breakTurnsRemaining = COMBAT_RULES.BREAK_DURATION_TURNS;
        defenderState.defensiveStance = DEFENSIVE_STANCES.NONE;
        didEnterBreak = true;
      }
    }

    return {
      newHp: defenderState.hp,
      newBreak: defenderState.breakGauge,
      didEnterBreak
    };
  }
};

module.exports = DamageService;