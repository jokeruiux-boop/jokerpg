/**
 * Joker RPG — Serviço de Efeitos de Status (Status Service)
 * Aplica, calcula e remove penalidades e benefícios temporários em combate:
 * BURN, FREEZE, SHOCK, POISON, STUN, WEAKNESS, ATTACK_UP, DEFENSE_UP.
 */

const { STATUS_EFFECTS } = require('../config/constants');

const StatusService = {
  /**
   * Aplica ou renova um efeito de status na lista de status do combatente.
   * @param {object} playerState - Estado do combatente
   * @param {string} type - Tipo de status (BURN, FREEZE, etc.)
   * @param {number} [duration=2] - Duração em rodadas
   * @param {number} [intensity=1] - Intensidade do efeito
   * @param {string|null} [sourcePlayerId=null] - Jogador que originou o efeito
   * @returns {object} O efeito de status aplicado
   */
  applyStatus(playerState, type, duration = 2, intensity = 1, sourcePlayerId = null) {
    if (!playerState) {
      throw new Error('Estado de jogador inválido para aplicação de status.');
    }

    if (!playerState.statusEffects) {
      playerState.statusEffects = [];
    }

    const existingEffect = playerState.statusEffects.find((e) => e.type === type);

    if (existingEffect) {
      // Renova a duração para a maior e acumula intensidade em casos aplicáveis (ex: POISON)
      existingEffect.duration = Math.max(existingEffect.duration, duration);
      if (type === STATUS_EFFECTS.POISON) {
        existingEffect.intensity = Math.min(5, existingEffect.intensity + intensity);
      } else {
        existingEffect.intensity = Math.max(existingEffect.intensity, intensity);
      }
      return existingEffect;
    }

    const newEffect = {
      type,
      duration,
      intensity,
      sourcePlayerId,
      appliedAtTurn: playerState.turnCount || 1
    };

    playerState.statusEffects.push(newEffect);
    return newEffect;
  },

  /**
   * Verifica se o combatente possui determinado status ativo.
   * @param {object} playerState
   * @param {string} type
   * @returns {boolean}
   */
  hasStatus(playerState, type) {
    if (!playerState || !Array.isArray(playerState.statusEffects)) return false;
    return playerState.statusEffects.some((e) => e.type === type && e.duration > 0);
  },

  /**
   * Remove um tipo específico de status do jogador.
   * @param {object} playerState
   * @param {string} type
   */
  removeStatus(playerState, type) {
    if (!playerState || !Array.isArray(playerState.statusEffects)) return;
    playerState.statusEffects = playerState.statusEffects.filter((e) => e.type !== type);
  },

  /**
   * Remove todos os efeitos negativos (debuffs) do jogador (purificação tática).
   * @param {object} playerState
   * @returns {number} Quantidade de debuffs removidos
   */
  purgeDebuffs(playerState) {
    if (!playerState || !Array.isArray(playerState.statusEffects)) return 0;
    const debuffTypes = [
      STATUS_EFFECTS.BURN,
      STATUS_EFFECTS.FREEZE,
      STATUS_EFFECTS.SHOCK,
      STATUS_EFFECTS.POISON,
      STATUS_EFFECTS.STUN,
      STATUS_EFFECTS.WEAKNESS
    ];

    const initialCount = playerState.statusEffects.length;
    playerState.statusEffects = playerState.statusEffects.filter((e) => !debuffTypes.includes(e.type));
    return initialCount - playerState.statusEffects.length;
  },

  /**
   * Remove todos os efeitos positivos (buffs) do alvo (purgação ofensiva).
   * @param {object} playerState
   * @returns {number} Quantidade de buffs removidos
   */
  purgeBuffs(playerState) {
    if (!playerState || !Array.isArray(playerState.statusEffects)) return 0;
    const buffTypes = [STATUS_EFFECTS.ATTACK_UP, STATUS_EFFECTS.DEFENSE_UP];

    const initialCount = playerState.statusEffects.length;
    playerState.statusEffects = playerState.statusEffects.filter((e) => !buffTypes.includes(e.type));
    return initialCount - playerState.statusEffects.length;
  },

  /**
   * Processa os efeitos contínuos no início do turno do combatente:
   * Aplica dano contínuo (DoT), restrições de ação e reduz a duração restante dos status.
   * @param {object} playerState
   * @returns {{ totalDamage: number, isStunned: boolean, messages: Array<string> }}
   */
  processTurnStartEffects(playerState) {
    if (!playerState || !Array.isArray(playerState.statusEffects)) {
      return { totalDamage: 0, isStunned: false, messages: [] };
    }

    let totalDamage = 0;
    let isStunned = false;
    const messages = [];
    const maxHp = Number(playerState.maxHp) || 1000;

    for (const effect of playerState.statusEffects) {
      if (effect.duration <= 0) continue;

      switch (effect.type) {
        case STATUS_EFFECTS.BURN: {
          // Dano de queimadura: 5% do HP máximo multiplicado pela intensidade
          const burnDmg = Math.round(maxHp * 0.05 * effect.intensity);
          playerState.hp = Math.max(0, playerState.hp - burnDmg);
          totalDamage += burnDmg;
          messages.push(`Chamas consomem o combatente: -${burnDmg} HP por queimadura (BURN).`);
          break;
        }

        case STATUS_EFFECTS.POISON: {
          // Veneno cumulativo: dano progressivo baseado no acúmulo de veneno
          const poisonDmg = Math.round(25 * effect.intensity);
          playerState.hp = Math.max(0, playerState.hp - poisonDmg);
          totalDamage += poisonDmg;
          messages.push(`Toxina corrosiva afeta a circulação: -${poisonDmg} HP por veneno (POISON x${effect.intensity}).`);
          break;
        }

        case STATUS_EFFECTS.SHOCK: {
          // Choque elétrico: 30% de chance de micro-dano e espasmo
          const shockDmg = Math.round(35 * effect.intensity);
          playerState.hp = Math.max(0, playerState.hp - shockDmg);
          totalDamage += shockDmg;
          messages.push(`Descarga residual causa espasmo: -${shockDmg} HP por choque elétrico (SHOCK).`);
          break;
        }

        case STATUS_EFFECTS.STUN: {
          // Atordoamento total: impede ações no turno
          isStunned = true;
          messages.push('Combatente está atordoado (STUN) e não poderá agir nesta rodada!');
          break;
        }

        case STATUS_EFFECTS.FREEZE: {
          messages.push('Frio extremo congela a circulação: regeneração de energia suspensa (FREEZE).');
          break;
        }

        case STATUS_EFFECTS.WEAKNESS: {
          messages.push('Força física debilitada pelo estado de fraqueza (WEAKNESS).');
          break;
        }

        default:
          break;
      }

      // Reduz a duração do efeito
      effect.duration -= 1;
    }

    // Filtra e elimina efeitos cuja duração expirou
    playerState.statusEffects = playerState.statusEffects.filter((e) => e.duration > 0);

    return {
      totalDamage,
      isStunned,
      messages
    };
  },

  /**
   * Calcula multiplicadores estatísticos derivados de buffs e debuffs ativos.
   * @param {object} playerState
   * @returns {{ attackMultiplier: number, defenseMultiplier: number, speedMultiplier: number }}
   */
  getStatModifiers(playerState) {
    let attackMultiplier = 1.0;
    let defenseMultiplier = 1.0;
    let speedMultiplier = 1.0;

    if (!playerState || !Array.isArray(playerState.statusEffects)) {
      return { attackMultiplier, defenseMultiplier, speedMultiplier };
    }

    for (const effect of playerState.statusEffects) {
      if (effect.duration <= 0) continue;

      if (effect.type === STATUS_EFFECTS.ATTACK_UP) {
        attackMultiplier += (0.25 * effect.intensity);
      }
      if (effect.type === STATUS_EFFECTS.WEAKNESS) {
        attackMultiplier -= (0.30 * effect.intensity);
      }
      if (effect.type === STATUS_EFFECTS.DEFENSE_UP) {
        defenseMultiplier += (0.25 * effect.intensity);
      }
      if (effect.type === STATUS_EFFECTS.FREEZE) {
        speedMultiplier -= 0.50;
      }
    }

    return {
      attackMultiplier: Math.max(0.2, attackMultiplier),
      defenseMultiplier: Math.max(0.2, defenseMultiplier),
      speedMultiplier: Math.max(0.2, speedMultiplier)
    };
  }
};

module.exports = StatusService;