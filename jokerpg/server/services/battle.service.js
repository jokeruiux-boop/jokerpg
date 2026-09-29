/**
 * Joker RPG — Serviço Central do Motor de Combate (Battle Service)
 * Orquestra o ciclo de vida das partidas, validação de turnos, execução de ações táticas,
 * consumo energético, acúmulo de combos, quebra de postura (Break) e finalização com recompensas.
 */

const BattleModel = require('../models/battle.model');
const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const DeckModel = require('../models/deck.model');
const DamageService = require('./damage.service');
const EnergyService = require('./energy.service');
const ComboService = require('./combo.service');
const StatusService = require('./status.service');
const ProgressionService = require('./progression.service');
const MissionService = require('./mission.service');
const { COMBAT_RULES, DEFENSIVE_STANCES, CARD_TYPES, STATUS_EFFECTS } = require('../config/constants');
const { withTransaction } = require('../../database/connection');

// Estado em memória das batalhas em andamento (sincronizado com o PostgreSQL)
const activeBattles = new Map();

const BattleService = {
  /**
   * Embaralha um array de cartas utilizando o algoritmo Fisher-Yates.
   * @param {Array} array
   * @returns {Array}
   */
  shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  /**
   * Constrói o estado inicial de combate para um participante da partida.
   * @param {object} user - Objeto do usuário
   * @param {object} character - Objeto do combatente
   * @param {Array} deckCards - Cartas do baralho ativo
   * @returns {object} Estado do jogador
   */
  initializeParticipantState(user, character, deckCards) {
    const baseHp = Number(character.base_hp) || 1000;
    const shuffledDeck = this.shuffle(deckCards);
    const hand = shuffledDeck.splice(0, COMBAT_RULES.MAX_CARDS_HAND);

    return {
      userId: user.id,
      username: user.username,
      characterId: character.id,
      characterName: character.name,
      element: character.element,
      characterClass: character.class,
      maxHp: baseHp,
      hp: baseHp,
      maxEnergy: COMBAT_RULES.MAX_ENERGY,
      energy: COMBAT_RULES.STARTING_ENERGY,
      maxBreakGauge: COMBAT_RULES.DEFAULT_BREAK_GAUGE,
      breakGauge: COMBAT_RULES.DEFAULT_BREAK_GAUGE,
      attack: Number(character.attack) || 60,
      defense: Number(character.defense) || 40,
      speed: Number(character.speed) || 50,
      critical_chance: Number(character.critical_chance) || 5.0,
      isBroken: false,
      breakTurnsRemaining: 0,
      defensiveStance: DEFENSIVE_STANCES.NONE,
      barrierHp: 0,
      statusEffects: [],
      comboCounter: 0,
      lastActionType: null,
      lastCardPlayed: null,
      hand,
      drawPile: shuffledDeck,
      discardPile: []
    };
  },

  /**
   * Cria e inicializa uma nova sessão de batalha (PvE ou PvP).
   * @param {object} params
   * @param {string} params.player1Id - UUID do Jogador 1
   * @param {string|null} [params.player2Id=null] - UUID do Jogador 2 (ou null para bot PvE)
   * @param {string} [params.mode='PVE_TRAINING'] - Modo da disputa
   * @returns {Promise<object>} Estado inicial consolidado da partida
   */
  async createBattle({ player1Id, player2Id = null, mode = 'PVE_TRAINING' }) {
    return await withTransaction(async (client) => {
      // 1. Carrega dados do Jogador 1
      const user1 = await UserModel.findById(player1Id, client);
      if (!user1 || !user1.main_character_id) {
        const error = new Error('Jogador 1 não possui personagem principal configurado.');
        error.statusCode = 400;
        throw error;
      }

      const char1 = await CharacterModel.findById(user1.main_character_id, client);
      const deck1 = await DeckModel.findActiveByUserId(player1Id, client);
      if (!deck1 || !deck1.cards || deck1.cards.length < COMBAT_RULES.MIN_DECK_CARDS) {
        const error = new Error('Você precisa de um baralho ativo completo com 10 cartas para combater.');
        error.statusCode = 400;
        throw error;
      }

      // 2. Carrega dados do Jogador 2 ou gera bot para treino PvE
      let user2;
      let char2;
      let deckCards2;

      if (player2Id) {
        user2 = await UserModel.findById(player2Id, client);
        if (!user2 || !user2.main_character_id) {
          const error = new Error('Jogador 2 não possui personagem principal configurado.');
          error.statusCode = 400;
          throw error;
        }
        char2 = await CharacterModel.findById(user2.main_character_id, client);
        const deck2 = await DeckModel.findActiveByUserId(player2Id, client);
        if (!deck2 || !deck2.cards || deck2.cards.length < COMBAT_RULES.MIN_DECK_CARDS) {
          const error = new Error('O oponente não possui um baralho ativo regulamentar.');
          error.statusCode = 400;
          throw error;
        }
        deckCards2 = deck2.cards;
      } else {
        // Oponente virtual (Bot de Treinamento)
        user2 = { id: '00000000-0000-0000-0000-000000000000', username: 'Autômato de Treino (IA)' };
        let botChar = await CharacterModel.findByName('Ignis, o Berserker Carmesim');
        if (!botChar) {
          const list = await CharacterModel.findAll({ limit: 1 });
          botChar = list.characters[0];
        }
        char2 = botChar;
        deckCards2 = deck1.cards; // O bot utiliza réplica do baralho balanceado
      }

      // 3. Cria registro mestre da batalha no banco
      const battleRecord = await BattleModel.create({
        mode,
        status: 'IN_PROGRESS'
      }, client);

      // 4. Salva snapshots dos combatentes
      await BattleModel.addPlayer({
        battleId: battleRecord.id,
        userId: user1.id,
        characterId: char1.id,
        initialHp: char1.base_hp,
        initialPower: user1.power_index
      }, client);

      if (player2Id) {
        await BattleModel.addPlayer({
          battleId: battleRecord.id,
          userId: user2.id,
          characterId: char2.id,
          initialHp: char2.base_hp,
          initialPower: user2.power_index
        }, client);
      }

      // 5. Constrói o estado estruturado da batalha
      const p1State = this.initializeParticipantState(user1, char1, deck1.cards);
      const p2State = this.initializeParticipantState(user2, char2, deckCards2);

      // Determina quem começa baseado no atributo de Velocidade (Speed)
      const p1Starts = p1State.speed >= p2State.speed;
      const activePlayerId = p1Starts ? p1State.userId : p2State.userId;

      const battleState = {
        battleId: battleRecord.id,
        mode,
        status: 'IN_PROGRESS',
        turnNumber: 1,
        activePlayerId,
        startTime: Date.now(),
        participants: {
          [p1State.userId]: p1State,
          [p2State.userId]: p2State
        },
        logs: [
          `O combate tático iniciou! ${p1Starts ? p1State.username : p2State.username} age primeiro devido à velocidade.`
        ]
      };

      activeBattles.set(battleRecord.id, battleState);
      return battleState;
    });
  },

  /**
   * Retorna o estado em memória ou recupera do banco caso a partida exista.
   * @param {string} battleId
   * @returns {object|null}
   */
  getBattleState(battleId) {
    return activeBattles.get(battleId) || null;
  },

  /**
   * Executa uma ação de combate autoritativa no turno do jogador.
   * Valida custos de energia, cartas na mão, postura de defesa, acúmulo de combos e dano.
   * @param {string} battleId - UUID da batalha
   * @param {string} userId - UUID do combatente que emitiu o comando
   * @param {object} actionPayload
   * @param {string} actionPayload.actionType - 'ATTACK', 'DEFENSE', 'BLOCK', 'DODGE', 'COUNTER', 'PASS', etc.
   * @param {string|null} [actionPayload.cardId=null] - UUID da carta jogada
   * @returns {Promise<object>} Resultado da ação e estado consolidado atualizado
   */
  async executeAction(battleId, userId, { actionType, cardId = null }) {
    const battle = this.getBattleState(battleId);
    if (!battle) {
      const error = new Error('Batalha não encontrada ou já encerrada.');
      error.statusCode = 404;
      throw error;
    }

    if (battle.status !== 'IN_PROGRESS') {
      const error = new Error('Esta batalha já foi finalizada.');
      error.statusCode = 400;
      throw error;
    }

    if (battle.activePlayerId !== userId) {
      const error = new Error('Não é o seu turno para realizar ações.');
      error.statusCode = 403;
      throw error;
    }

    const attacker = battle.participants[userId];
    const opponentId = Object.keys(battle.participants).find((id) => id !== userId);
    const defender = battle.participants[opponentId];

    if (!attacker || !defender) {
      const error = new Error('Participantes da batalha corrompidos.');
      error.statusCode = 500;
      throw error;
    }

    // 1. Trata ação especial de encerramento voluntário de turno (PASS)
    if (actionType === 'PASS') {
      battle.logs.push(`${attacker.username} passou o turno para reorganizar suas forças.`);
      return await this.passTurn(battleId);
    }

    // 2. Localiza e valida carta na mão (caso a ação exija carta)
    let playedCard = null;
    if (cardId) {
      const cardIndex = attacker.hand.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) {
        const error = new Error('A carta selecionada não está disponível na sua mão nesta rodada.');
        error.statusCode = 400;
        throw error;
      }
      playedCard = attacker.hand[cardIndex];

      // Validação e dedução de energia
      EnergyService.validateAndDeduct(attacker, actionType, playedCard);

      // Remove a carta da mão e a adiciona à pilha de descarte
      attacker.hand.splice(cardIndex, 1);
      attacker.discardPile.push(playedCard);
    } else {
      // Manobras sem carta (ex: Posturas diretas de BLOCK, DODGE, COUNTER)
      EnergyService.validateAndDeduct(attacker, actionType, null);
    }

    // Acompanhamento automático de missão: Jogar cartas
    if (playedCard && !userId.startsWith('00000000')) {
      await MissionService.trackProgress(userId, 'PLAY_CARDS', 1);
    }

    let actionSummary = {
      actionType,
      damageDealt: 0,
      breakDealt: 0,
      wasCritical: false,
      comboMultiplier: 1.0,
      defenseLog: null
    };

    // 3. Processamento de Ações Defensivas
    if (actionType === 'BLOCK' || actionType === 'DODGE' || actionType === 'COUNTER') {
      attacker.defensiveStance = actionType;
      const stanceMsg = `${attacker.username} assumiu a postura tática de ${actionType}!`;
      battle.logs.push(stanceMsg);

      if (!userId.startsWith('00000000')) {
        await MissionService.trackProgress(userId, 'USE_DEFENSE', 1);
      }

      actionSummary.defenseLog = stanceMsg;
    } else if (playedCard && playedCard.type === CARD_TYPES.DEFENSE) {
      if (playedCard.effect_code === 'APPLY_BARRIER') {
        attacker.defensiveStance = DEFENSIVE_STANCES.BARRIER;
        attacker.barrierHp = Number(playedCard.defense) || 200;
        battle.logs.push(`${attacker.username} ergueu uma Barreira Mística (+${attacker.barrierHp} HP de escudo).`);
      } else if (playedCard.effect_code === 'COUNTER_STANCE') {
        attacker.defensiveStance = DEFENSIVE_STANCES.COUNTER;
        battle.logs.push(`${attacker.username} preparou uma postura de Ripostagem.`);
      } else if (playedCard.effect_code === 'DODGE_BOOST') {
        attacker.defensiveStance = DEFENSIVE_STANCES.DODGE;
        battle.logs.push(`${attacker.username} aumentou seus reflexos de esquiva.`);
      } else {
        attacker.defensiveStance = DEFENSIVE_STANCES.BLOCK;
        battle.logs.push(`${attacker.username} fortificou sua defesa com ${playedCard.name}.`);
      }

      if (!userId.startsWith('00000000')) {
        await MissionService.trackProgress(userId, 'USE_DEFENSE', 1);
      }
    } else {
      // 4. Processamento de Ações Ofensivas (ATTACK, TECHNIQUE, SPECIAL, ULTIMATE)
      const comboOutcome = ComboService.updateComboState(attacker, actionType, playedCard);

      const damageOutcome = DamageService.calculateAttackDamage({
        attackerState: attacker,
        defenderState: defender,
        card: playedCard,
        actionType,
        comboResult: comboOutcome
      });

      DamageService.applyDamageAndBreak(defender, damageOutcome);

      actionSummary = {
        actionType,
        damageDealt: damageOutcome.damageDealt,
        breakDealt: damageOutcome.breakDealt,
        wasCritical: damageOutcome.wasCritical,
        comboMultiplier: damageOutcome.comboMultiplier,
        defenseLog: damageOutcome.defenseLog
      };

      // Registra no log de combate
      let combatLog = `${attacker.username} utilizou [${playedCard ? playedCard.name : actionType}]`;
      if (comboOutcome.label) combatLog += ` | ${comboOutcome.label}!`;
      if (damageOutcome.wasCritical) combatLog += ' 💥 GOLPE CRÍTICO!';
      combatLog += ` desferindo ${damageOutcome.damageDealt} de dano`;
      if (damageOutcome.breakDealt > 0) combatLog += ` e ${damageOutcome.breakDealt} de dano de postura`;
      combatLog += `.`;

      battle.logs.push(combatLog);
      if (damageOutcome.defenseLog) battle.logs.push(`🛡️ ${damageOutcome.defenseLog}`);

      // Se o defensor foi contra-atacado pela postura de COUNTER
      if (damageOutcome.isCountered && damageOutcome.counterDamage > 0) {
        attacker.hp = Math.max(0, attacker.hp - damageOutcome.counterDamage);
        battle.logs.push(`⚠️ ${attacker.username} sofreu ${damageOutcome.counterDamage} de dano pela ripostagem do defensor!`);
      }

      // Se entrou no estado de Break
      if (damageOutcome.didEnterBreak || defender.isBroken && defender.breakGauge === 0) {
        battle.logs.push(`⚡ POSTURA QUEBRADA! ${defender.username} entrou em estado de BREAK!`);
        if (!userId.startsWith('00000000')) {
          await MissionService.trackProgress(userId, 'BREAK_POSTURE', 1);
        }
      }

      // Aplica efeitos contínuos da carta no defensor
      if (playedCard && playedCard.effect_code && playedCard.effect_code.startsWith('APPLY_')) {
        const statusType = playedCard.effect_code.replace('APPLY_', '');
        if (STATUS_EFFECTS[statusType]) {
          StatusService.applyStatus(defender, statusType, 2, 1, attacker.userId);
          battle.logs.push(`✨ Efeito de status [${statusType}] aplicado em ${defender.username}.`);
        }
      }

      // Telemetria de missões de combate
      if (!userId.startsWith('00000000')) {
        if (damageOutcome.damageDealt > 0) {
          await MissionService.trackProgress(userId, 'DEAL_DAMAGE', damageOutcome.damageDealt);
        }
        if (comboOutcome.streak >= 3) {
          await MissionService.trackProgress(userId, 'EXECUTE_COMBOS', 1);
        }
      }
    }

    // 5. Registra a telemetria detalhada da ação no banco de dados
    await BattleModel.recordAction({
      battleId,
      turnNumber: battle.turnNumber,
      actorUserId: (userId.startsWith('00000000') ? null : userId),
      actionType,
      cardId: playedCard ? playedCard.id : null,
      damageDealt: actionSummary.damageDealt,
      breakDealt: actionSummary.breakDealt,
      wasCritical: actionSummary.wasCritical,
      comboMultiplier: actionSummary.comboMultiplier
    });

    // 6. Avaliação de Término de Combate (Morte de um dos combatentes)
    if (defender.hp <= 0 || attacker.hp <= 0) {
      let winnerId;
      let loserId;

      if (defender.hp <= 0) {
        winnerId = attacker.userId;
        loserId = defender.userId;
      } else {
        winnerId = defender.userId;
        loserId = attacker.userId;
      }

      return await this.finishBattle(battleId, winnerId, loserId);
    }

    // Caso a mão do atacante fique vazia ou sem energia suficiente, auxilia a dinâmica
    return {
      success: true,
      battle,
      actionSummary
    };
  },

  /**
   * Conclui o turno do jogador ativo e transfere o controle para o oponente.
   * Restaura energia, processa DoT (queimadura, veneno) e compra novas cartas.
   * @param {string} battleId - UUID da batalha
   * @returns {Promise<object>} Estado atualizado após a troca de turno
   */
  async passTurn(battleId) {
    const battle = this.getBattleState(battleId);
    if (!battle || battle.status !== 'IN_PROGRESS') {
      throw new Error('Combate não está ativo para alternância de turno.');
    }

    const currentActor = battle.participants[battle.activePlayerId];
    ComboService.resetCombo(currentActor);

    // Alterna o jogador ativo
    const nextPlayerId = Object.keys(battle.participants).find((id) => id !== battle.activePlayerId);
    battle.activePlayerId = nextPlayerId;
    battle.turnNumber += 1;

    const nextActor = battle.participants[nextPlayerId];

    // 1. Processamento de Break (Duração de vulnerabilidade)
    if (nextActor.isBroken) {
      nextActor.breakTurnsRemaining -= 1;
      if (nextActor.breakTurnsRemaining <= 0) {
        nextActor.isBroken = false;
        nextActor.breakGauge = Math.round(nextActor.maxBreakGauge * (COMBAT_RULES.BREAK_RECOVERY_PERCENT / 100));
        battle.logs.push(`🛡️ ${nextActor.username} recuperou sua postura e saiu do estado de Break.`);
      }
    }

    // 2. Processa Efeitos de Início de Turno (DoT: Queimadura, Veneno, Choque, Stun)
    const turnStartEffects = StatusService.processTurnStartEffects(nextActor);
    if (turnStartEffects.messages.length > 0) {
      battle.logs.push(...turnStartEffects.messages);
    }

    // Verifica se os efeitos de status causaram derrota do combatente
    if (nextActor.hp <= 0) {
      return await this.finishBattle(battleId, currentActor.userId, nextActor.userId);
    }

    // 3. Regeneração Passiva de Energia
    const isFrozen = StatusService.hasStatus(nextActor, STATUS_EFFECTS.FREEZE);
    if (!isFrozen) {
      nextActor.energy = EnergyService.recoverEnergyPerTurn(nextActor.energy, nextActor.maxEnergy);
    }

    // 4. Reposição de Cartas na Mão (Compra até o limite máximo de 5 cartas)
    while (nextActor.hand.length < COMBAT_RULES.MAX_CARDS_HAND) {
      if (nextActor.drawPile.length === 0) {
        if (nextActor.discardPile.length > 0) {
          nextActor.drawPile = this.shuffle(nextActor.discardPile);
          nextActor.discardPile = [];
        } else {
          break; // Todas as cartas do baralho estão na mão
        }
      }
      nextActor.hand.push(nextActor.drawPile.shift());
    }

    // 5. Se o oponente for o Bot de Treinamento e for a vez dele, executa a IA
    if (nextActor.userId.startsWith('00000000') && battle.status === 'IN_PROGRESS') {
      setTimeout(async () => {
        try {
          await this.executeBotTurn(battleId);
        } catch (botErr) {
          console.error('[BATTLE BOT ERROR]', botErr.message);
        }
      }, 800);
    }

    return {
      success: true,
      battle,
      isStunned: turnStartEffects.isStunned
    };
  },

  /**
   * Inteligência Artificial do Bot para partidas de treinamento PvE.
   * Analisa a mão, postura do jogador e decide entre atacar, quebrar postura ou defender.
   * @param {string} battleId
   */
  async executeBotTurn(battleId) {
    const battle = this.getBattleState(battleId);
    if (!battle || battle.status !== 'IN_PROGRESS' || !battle.activePlayerId.startsWith('00000000')) {
      return;
    }

    const bot = battle.participants[battle.activePlayerId];
    const opponentId = Object.keys(battle.participants).find((id) => id !== bot.userId);
    const opponent = battle.participants[opponentId];

    // Se o oponente estiver em Break, prioriza dano máximo
    const playableCards = bot.hand.filter((c) => c.energy_cost <= bot.energy);

    if (playableCards.length > 0) {
      let chosenCard;
      if (opponent.isBroken) {
        chosenCard = playableCards.sort((a, b) => b.damage - a.damage)[0];
      } else if (opponent.breakGauge > 0) {
        chosenCard = playableCards.sort((a, b) => b.break_damage - a.break_damage)[0];
      } else {
        chosenCard = playableCards[0];
      }

      await this.executeAction(battleId, bot.userId, {
        actionType: chosenCard.type,
        cardId: chosenCard.id
      });

      // Tenta encadear uma segunda ação se possuir energia remanescente
      const remainingBattle = this.getBattleState(battleId);
      if (remainingBattle && remainingBattle.status === 'IN_PROGRESS' && remainingBattle.activePlayerId === bot.userId) {
        const nextPlayable = bot.hand.filter((c) => c.energy_cost <= bot.energy);
        if (nextPlayable.length > 0) {
          await this.executeAction(battleId, bot.userId, {
            actionType: nextPlayable[0].type,
            cardId: nextPlayable[0].id
          });
        }
      }
    }

    // Se a batalha ainda estiver no turno do Bot, passa o turno para o jogador humano
    const checkState = this.getBattleState(battleId);
    if (checkState && checkState.status === 'IN_PROGRESS' && checkState.activePlayerId === bot.userId) {
      await this.passTurn(battleId);
    }
  },

  /**
   * Finaliza uma batalha de forma definitiva, computando recompensas atômicas e atualizando o PostgreSQL.
   * @param {string} battleId - UUID da batalha
   * @param {string} winnerId - UUID do combatente vitorioso
   * @param {string} loserId - UUID do combatente derrotado
   * @returns {Promise<object>}
   */
  async finishBattle(battleId, winnerId, loserId) {
    const battle = this.getBattleState(battleId);
    if (!battle) {
      throw new Error('Batalha não localizada para finalização.');
    }

    battle.status = 'FINISHED';
    battle.winnerId = winnerId;
    battle.loserId = loserId;

    const durationSeconds = Math.max(1, Math.round((Date.now() - battle.startTime) / 1000));
    const winnerName = battle.participants[winnerId] ? battle.participants[winnerId].username : 'Vencedor';
    battle.logs.push(`🏆 VITÓRIA! ${winnerName} triunfou no combate após ${battle.turnNumber} rodadas.`);

    return await withTransaction(async (client) => {
      // 1. Atualiza registro da batalha no PostgreSQL
      await BattleModel.finishBattle({
        battleId,
        winnerId: winnerId.startsWith('00000000') ? null : winnerId,
        loserId: loserId.startsWith('00000000') ? null : loserId,
        totalTurns: battle.turnNumber,
        durationSeconds
      }, client);

      // 2. Concede recompensas de progressão (XP, Moedas, Ranking)
      let rewards = null;
      if (!winnerId.startsWith('00000000')) {
        rewards = await ProgressionService.processBattleEndRewards({
          winnerId,
          loserId: loserId.startsWith('00000000') ? null : loserId,
          mode: battle.mode,
          totalTurns: battle.turnNumber,
          winnerCharId: battle.participants[winnerId].characterId,
          loserCharId: battle.participants[loserId] ? battle.participants[loserId].characterId : null
        }, client);

        // Acompanhamento automático de missão: Vitória em batalha
        await MissionService.trackProgress(winnerId, 'WIN_BATTLES', 1, client);
      }

      battle.rewards = rewards;
      return {
        success: true,
        finished: true,
        winnerId,
        loserId,
        battle,
        rewards
      };
    });
  },

  /**
   * Abandono/Rendição de uma partida em andamento. Concede vitória automática ao oponente.
   * @param {string} battleId
   * @param {string} userId - UUID do jogador que declarou desistência
   * @returns {Promise<object>}
   */
  async concedeBattle(battleId, userId) {
    const battle = this.getBattleState(battleId);
    if (!battle || battle.status !== 'IN_PROGRESS') {
      const error = new Error('Combate não encontrado ou já encerrado.');
      error.statusCode = 404;
      throw error;
    }

    const opponentId = Object.keys(battle.participants).find((id) => id !== userId);
    battle.logs.push(`🏳️ ${battle.participants[userId].username} rendeu-se e declarou retirada tática.`);

    return await this.finishBattle(battleId, opponentId, userId);
  }
};

module.exports = BattleService;