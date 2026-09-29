/**
 * Joker RPG — Serviço Administrativo Supremo (Admin Service)
 * Centraliza métricas globais do sistema, moderação de jogadores,
 * visualização de telemetria de combate e trilha de auditoria para o Administrador Supremo.
 */

const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const CardModel = require('../models/card.model');
const BattleModel = require('../models/battle.model');
const MissionModel = require('../models/mission.model');
const RankingModel = require('../models/ranking.model');
const AdminLogModel = require('../models/adminLog.model');

const AdminService = {
  /**
   * Consolida métricas executivas e dados em tempo real para o Dashboard Administrativo.
   * @returns {Promise<object>}
   */
  async getDashboardOverview() {
    const [
      usersResult,
      totalCharacters,
      totalCards,
      totalBattles,
      totalMissions,
      recentLogs,
      recentBattles
    ] = await Promise.all([
      UserModel.findAllPaginated({ page: 1, limit: 1 }),
      CharacterModel.count(),
      CardModel.count(),
      BattleModel.count(),
      MissionModel.count(),
      AdminLogModel.getRecentLogs(8),
      BattleModel.getRecentBattles(6)
    ]);

    return {
      metrics: {
        totalUsers: usersResult.total,
        totalCharacters,
        totalCards,
        totalBattles,
        totalMissions
      },
      recentLogs,
      recentBattles
    };
  },

  /**
   * Lista jogadores de forma paginada com suporte a busca textual e filtros de moderação.
   * @param {object} filters - { page, limit, search, role, isBlocked }
   * @returns {Promise<{ users: Array, total: number, totalPages: number, currentPage: number }>}
   */
  async listUsers(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(filters.limit, 10) || 15));

    const result = await UserModel.findAllPaginated({
      ...filters,
      page,
      limit
    });

    const totalPages = Math.ceil(result.total / limit) || 1;

    return {
      users: result.users,
      total: result.total,
      totalPages,
      currentPage: page
    };
  },

  /**
   * Alterna o estado de bloqueio de um jogador (Bloquear / Desbloquear acesso à arena).
   * Registra a ação imediatamente na trilha de auditoria administrativa.
   * @param {string} adminId - UUID do administrador executor
   * @param {string} userId - UUID do usuário alvo
   * @param {string} [ipAddress='127.0.0.1'] - Endereço IP da requisição
   * @returns {Promise<boolean>} Novo estado de bloqueio (is_blocked)
   */
  async toggleUserBlock(adminId, userId, ipAddress = '127.0.0.1') {
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('Jogador não encontrado para moderação.');
      error.statusCode = 404;
      throw error;
    }

    if (user.role === 'ADMIN_SUPREMO') {
      const error = new Error('Operação negada: Não é permitido bloquear outro Administrador Supremo.');
      error.statusCode = 403;
      throw error;
    }

    const newBlockedState = !user.is_blocked;
    await UserModel.setBlockedStatus(userId, newBlockedState);

    // Registra log de auditoria
    await AdminLogModel.create({
      adminId,
      actionName: newBlockedState ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
      targetEntity: 'users',
      targetId: userId,
      ipAddress,
      details: {
        targetUsername: user.username,
        targetEmail: user.email,
        previousState: user.is_blocked,
        newState: newBlockedState
      }
    });

    return newBlockedState;
  },

  /**
   * Registra uma operação sensível executada por um administrador.
   * @param {string} adminId - UUID do administrador
   * @param {string} actionName - Identificador da ação (ex: 'CARD_CREATED')
   * @param {string} targetEntity - Entidade impactada ('characters', 'cards', etc.)
   * @param {string|null} targetId - ID do recurso modificado
   * @param {string} ipAddress - IP de origem
   * @param {object} details - Detalhamento em JSON
   * @returns {Promise<object>}
   */
  async logAdminAction(adminId, actionName, targetEntity, targetId = null, ipAddress = '127.0.0.1', details = {}) {
    return await AdminLogModel.create({
      adminId,
      actionName,
      targetEntity,
      targetId,
      ipAddress,
      details
    });
  },

  /**
   * Retorna os registros paginados da trilha de auditoria de administradores.
   * @param {object} filters - { page, limit, actionName, adminId }
   * @returns {Promise<{ logs: Array, total: number, totalPages: number, currentPage: number }>}
   */
  async getAuditLogs(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const result = await AdminLogModel.findAllPaginated({
      limit,
      offset,
      actionName: filters.actionName || null,
      adminId: filters.adminId || null
    });

    const totalPages = Math.ceil(result.total / limit) || 1;

    return {
      logs: result.logs,
      total: result.total,
      totalPages,
      currentPage: page
    };
  }
};

module.exports = AdminService;