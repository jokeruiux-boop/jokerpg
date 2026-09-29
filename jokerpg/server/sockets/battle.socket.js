/**
 * Joker RPG — Handlers de Tempo Real para Batalhas PvP (Battle Socket)
 * Gerencia a comunicação WebSocket via Socket.IO:
 * Entrada na fila de matchmaking, sincronização síncrona de turnos,
 * emissão de ações de combate, cálculos de dano e encerramento de disputas.
 */

const BattleService = require('../services/battle.service');
const MatchmakingService = require('../services/matchmaking.service');
const UserModel = require('../models/user.model');
const RankingModel = require('../models/ranking.model');

// Mapa de temporizadores de desconexão ativa por jogador em batalha: battleId -> { [userId]: Timeout }
const disconnectTimeouts = new Map();

/**
 * Registra os listeners de eventos de combate e pareamento para a conexão socket.
 * @param {import('socket.io').Server} io - Instância do servidor Socket.IO
 * @param {import('socket.io').Socket} socket - Socket do cliente conectado
 */
function registerBattleSocketHandlers(io, socket) {
  const session = socket.request.session;
  const user = session ? session.user : null;

  if (!user) {
    // Conexões não autenticadas são isoladas de eventos de combate
    return;
  }

  const userId = user.id;
  const username = user.username;

  /**
   * Evento: pvp:join_queue
   * Insere o jogador na fila de espera PvP e avalia pareamento imediato.
   */
  socket.on('pvp:join_queue', async (data = {}) => {
    try {
      const mode = data.mode === 'PVP_RANKED' ? 'PVP_RANKED' : 'PVP_CASUAL';

      // Recupera dados atualizados de classificação e poder
      const [userRecord, rankingRecord] = await Promise.all([
        UserModel.findById(userId),
        RankingModel.getUserRanking(userId)
      ]);

      const rating = rankingRecord ? rankingRecord.rating : 1000;
      const power = userRecord ? userRecord.power_index : 100;

      const matchResult = await MatchmakingService.addToQueue({
        userId,
        username,
        socketId: socket.id,
        mode,
        rating,
        power
      });

      if (matchResult && matchResult.matched) {
        const { battleId, battle, player1, player2 } = matchResult;
        const roomName = `battle_${battleId}`;

        // Conecta ambos os sockets à sala da batalha
        socket.join(roomName);
        const opponentSocket = io.sockets.sockets.get(player1.socketId);
        if (opponentSocket) {
          opponentSocket.join(roomName);
        }

        // Emite o início oficial da disputa para a sala
        io.to(roomName).emit('battle:started', {
          battleId,
          mode: battle.mode,
          activePlayerId: battle.activePlayerId,
          battle
        });
      } else {
        socket.emit('pvp:queue_entered', {
          mode,
          message: 'Você entrou na fila de pareamento. Procurando adversário digno...'
        });
      }
    } catch (error) {
      socket.emit('battle:error', { message: error.message });
    }
  });

  /**
   * Evento: pvp:leave_queue
   * Remove o jogador da fila de matchmaking sob demanda.
   */
  socket.on('pvp:leave_queue', () => {
    MatchmakingService.removeFromQueue(userId);
    socket.emit('pvp:queue_left', { message: 'Você saiu da fila de pareamento.' });
  });

  /**
   * Evento: battle:join_room
   * Associa o socket à sala virtual da batalha em andamento (reconectar ou carregar tela).
   */
  socket.on('battle:join_room', ({ battleId }) => {
    if (!battleId) return;

    const roomName = `battle_${battleId}`;
    socket.join(roomName);

    // Cancela eventual cronômetro de desconexão ativa caso o jogador tenha retornado
    if (disconnectTimeouts.has(battleId)) {
      const timeouts = disconnectTimeouts.get(battleId);
      if (timeouts[userId]) {
        clearTimeout(timeouts[userId]);
        delete timeouts[userId];
        io.to(roomName).emit('battle:player_reconnected', {
          userId,
          username,
          message: `${username} restabeleceu a conexão com a arena!`
        });
      }
    }

    const battleState = BattleService.getBattleState(battleId);
    if (battleState) {
      socket.emit('battle:state_sync', {
        battle: battleState,
        isMyTurn: battleState.activePlayerId === userId
      });
    }
  });

  /**
   * Evento: battle:action
   * Recebe um comando de ação tática (ataque, técnica, postura defensiva).
   */
  socket.on('battle:action', async ({ battleId, actionType, cardId }) => {
    try {
      const result = await BattleService.executeAction(battleId, userId, {
        actionType,
        cardId
      });

      const roomName = `battle_${battleId}`;

      if (result.finished) {
        // Encerramento da partida com vitória
        io.to(roomName).emit('battle:finished', {
          winnerId: result.winnerId,
          loserId: result.loserId,
          battle: result.battle,
          rewards: result.rewards
        });
      } else {
        // Atualização de estado no meio do combate
        io.to(roomName).emit('battle:state_update', {
          battle: result.battle,
          actionSummary: result.actionSummary,
          lastActorId: userId
        });
      }
    } catch (error) {
      socket.emit('battle:error', { message: error.message });
    }
  });

  /**
   * Evento: battle:pass
   * Passagem autoritativa de turno emitida pelo jogador ativo.
   */
  socket.on('battle:pass', async ({ battleId }) => {
    try {
      const battle = BattleService.getBattleState(battleId);
      if (!battle || battle.activePlayerId !== userId) {
        return socket.emit('battle:error', { message: 'Apenas o jogador ativo pode passar a vez.' });
      }

      const result = await BattleService.passTurn(battleId);
      const roomName = `battle_${battleId}`;

      if (result.finished) {
        io.to(roomName).emit('battle:finished', {
          winnerId: result.winnerId,
          loserId: result.loserId,
          battle: result.battle,
          rewards: result.rewards
        });
      } else {
        io.to(roomName).emit('battle:turn_changed', {
          battle: result.battle,
          activePlayerId: result.battle.activePlayerId,
          turnNumber: result.battle.turnNumber
        });
      }
    } catch (error) {
      socket.emit('battle:error', { message: error.message });
    }
  });

  /**
   * Evento: battle:concede
   * Desistência voluntária no combate.
   */
  socket.on('battle:concede', async ({ battleId }) => {
    try {
      const result = await BattleService.concedeBattle(battleId, userId);
      const roomName = `battle_${battleId}`;

      io.to(roomName).emit('battle:finished', {
        winnerId: result.winnerId,
        loserId: result.loserId,
        battle: result.battle,
        rewards: result.rewards,
        conceded: true
      });
    } catch (error) {
      socket.emit('battle:error', { message: error.message });
    }
  });

  /**
   * Evento nativo: disconnect
   * Limpa referências em filas e gerencia tolerância a desconexões em partidas ativas.
   */
  socket.on('disconnect', () => {
    // 1. Remove da fila de matchmaking caso estivesse aguardando
    MatchmakingService.removeBySocketId(socket.id);

    // 2. Localiza se o usuário estava no meio de um confronto síncrono ativo
    for (const [battleId, battle] of require('../services/battle.service').activeBattles ? require('../services/battle.service').activeBattles.entries() : []) {
      if (battle.status === 'IN_PROGRESS' && battle.participants[userId]) {
        const roomName = `battle_${battleId}`;

        io.to(roomName).emit('battle:player_disconnected', {
          userId,
          username,
          message: `${username} desconectou-se. Tolerância de 45 segundos para retorno...`
        });

        if (!disconnectTimeouts.has(battleId)) {
          disconnectTimeouts.set(battleId, {});
        }

        const timeouts = disconnectTimeouts.get(battleId);

        // Dispara cronômetro de tolerância (45 segundos)
        timeouts[userId] = setTimeout(async () => {
          try {
            const currentBattle = BattleService.getBattleState(battleId);
            if (currentBattle && currentBattle.status === 'IN_PROGRESS') {
              const opponentId = Object.keys(currentBattle.participants).find((id) => id !== userId);
              const finishResult = await BattleService.finishBattle(battleId, opponentId, userId);

              io.to(roomName).emit('battle:finished', {
                winnerId: finishResult.winnerId,
                loserId: finishResult.loserId,
                battle: finishResult.battle,
                rewards: finishResult.rewards,
                reason: 'W.O. — O adversário não retornou a tempo após desconexão.'
              });
            }
          } catch (timeoutErr) {
            console.error('[SOCKET DISCONNECT TIMEOUT ERROR]', timeoutErr.message);
          }
        }, 45000);
      }
    }
  });
}

module.exports = {
  registerBattleSocketHandlers
};