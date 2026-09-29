/**
 * Joker RPG — Serviço de Pareamento Online (Matchmaking Service)
 * Gerencia a fila de espera para duelos PvP (Casual e Ranqueado),
 * calculando proximidade de Rating/Poder e inicializando salas de combate síncronas.
 */

const BattleService = require('./battle.service');

// Fila em memória de jogadores aguardando adversário
const matchmakingQueue = [];

const MatchmakingService = {
  /**
   * Adiciona um combatente à fila de espera de pareamento PvP.
   * Remove entradas anteriores do mesmo usuário para evitar duplicações.
   * @param {object} player - Dados do jogador para pareamento
   * @param {string} player.userId - UUID do jogador
   * @param {string} player.username - Nome do usuário
   * @param {string} player.socketId - ID do socket conectado
   * @param {string} [player.mode='PVP_CASUAL'] - Modo de combate ('PVP_CASUAL' ou 'PVP_RANKED')
   * @param {number} [player.rating=1000] - Pontuação ELO/Rating atual
   * @param {number} [player.power=100] - Poder de combate indexado
   * @returns {Promise<object|null>} Retorna o duelo caso um oponente compatível seja localizado imediatamente
   */
  async addToQueue({ userId, username, socketId, mode = 'PVP_CASUAL', rating = 1000, power = 100 }) {
    // Remove qualquer registro prévio do jogador na fila
    this.removeFromQueue(userId);

    const candidate = {
      userId,
      username,
      socketId,
      mode,
      rating: Number(rating) || 1000,
      power: Number(power) || 100,
      joinedAt: Date.now()
    };

    // Procura por um oponente elegível na fila
    const matchedOpponent = this.findEligibleOpponent(candidate);

    if (matchedOpponent) {
      // Remove o oponente encontrado da fila de espera
      this.removeFromQueue(matchedOpponent.userId);

      // Cria a batalha de forma autoritativa no BattleService
      const battleState = await BattleService.createBattle({
        player1Id: matchedOpponent.userId,
        player2Id: candidate.userId,
        mode: candidate.mode
      });

      return {
        matched: true,
        battleId: battleState.battleId,
        battle: battleState,
        player1: matchedOpponent,
        player2: candidate
      };
    }

    // Se nenhum oponente estiver disponível, insere o jogador na fila de espera
    matchmakingQueue.push(candidate);
    return null;
  },

  /**
   * Localiza um adversário compatível dentro da fila respeitando o modo de jogo e critérios de pareamento.
   * Com o aumento do tempo de espera, o intervalo de tolerância de rating se expande dinamicamente.
   * @param {object} candidate
   * @returns {object|null}
   */
  findEligibleOpponent(candidate) {
    const now = Date.now();

    for (let i = 0; i < matchmakingQueue.length; i++) {
      const queuedPlayer = matchmakingQueue[i];

      // Impede auto-pareamento
      if (queuedPlayer.userId === candidate.userId) continue;

      // O modo de combate deve coincidir obrigatoriamente
      if (queuedPlayer.mode !== candidate.mode) continue;

      if (candidate.mode === 'PVP_CASUAL') {
        // No modo casual, pareamento imediato prioritário por disponibilidade
        return queuedPlayer;
      }

      // No modo ranqueado (PVP_RANKED), calcula tolerância baseada no tempo de espera
      const waitTimeSeconds = (now - queuedPlayer.joinedAt) / 1000;
      // Faixa inicial de ±150 pontos, expandindo 25 pontos a cada 10 segundos de fila
      const ratingTolerance = 150 + Math.floor(waitTimeSeconds / 10) * 25;

      const ratingDiff = Math.abs(candidate.rating - queuedPlayer.rating);
      if (ratingDiff <= ratingTolerance) {
        return queuedPlayer;
      }
    }

    return null;
  },

  /**
   * Remove um jogador da fila de pareamento (desconexão ou cancelamento manual).
   * @param {string} userId - UUID do jogador
   * @returns {boolean} True se o jogador foi localizado e removido
   */
  removeFromQueue(userId) {
    const index = matchmakingQueue.findIndex((p) => p.userId === userId);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      return true;
    }
    return false;
  },

  /**
   * Remove um combatente da fila através do socket desconectado.
   * @param {string} socketId - ID do socket
   */
  removeBySocketId(socketId) {
    const index = matchmakingQueue.findIndex((p) => p.socketId === socketId);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
    }
  },

  /**
   * Verifica se determinado usuário está atualmente em busca de partida.
   * @param {string} userId
   * @returns {boolean}
   */
  isUserInQueue(userId) {
    return matchmakingQueue.some((p) => p.userId === userId);
  },

  /**
   * Retorna a quantidade de duelistas aguardando adversário por modo.
   * @param {string|null} [mode=null]
   * @returns {number}
   */
  getQueueCount(mode = null) {
    if (!mode) return matchmakingQueue.length;
    return matchmakingQueue.filter((p) => p.mode === mode).length;
  }
};

module.exports = MatchmakingService;