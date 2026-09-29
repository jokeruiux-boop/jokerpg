/**
 * Joker RPG — Controlador Administrativo Supremo (Admin Controller)
 * Orquestra o painel de controle do Administrador Supremo:
 * Moderação de jogadores, gestão de combatentes e cartas (com uploads BYTEA),
 * supervisão de missões, telemetria de batalhas e auditoria de registros.
 */

const AdminService = require('../services/admin.service');
const CharacterService = require('../services/character.service');
const CardService = require('../services/card.service');
const MissionService = require('../services/mission.service');
const BattleModel = require('../models/battle.model');
const {
  CLASSES,
  ELEMENTS,
  RARITIES,
  CARD_TYPES,
  MISSION_CATEGORIES,
  MISSION_REQUIREMENTS
} = require('../config/constants');

const AdminController = {
  /**
   * Renderiza a visão geral do Dashboard Administrativo com métricas e telemetria recente.
   * Rota: GET /admin
   */
  async dashboard(req, res, next) {
    try {
      const overview = await AdminService.getDashboardOverview();

      res.render('admin/dashboard', {
        pageTitle: 'Painel de Controle Supremo — Joker RPG',
        metrics: overview.metrics,
        recentLogs: overview.recentLogs,
        recentBattles: overview.recentBattles
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a listagem de usuários com opções de busca e moderação.
   * Rota: GET /admin/users
   */
  async users(req, res, next) {
    try {
      const { search, role, isBlocked, page = 1 } = req.query;

      const result = await AdminService.listUsers({
        search,
        role,
        isBlocked,
        page,
        limit: 15
      });

      res.render('admin/users', {
        pageTitle: 'Gerenciamento de Jogadores — Administração',
        users: result.users,
        pagination: {
          total: result.total,
          totalPages: result.totalPages,
          currentPage: result.currentPage
        },
        filters: {
          search: search || '',
          role: role || '',
          isBlocked: isBlocked || ''
        },
        successMessage: req.query.success === 'status_updated' ? 'Status do jogador atualizado com sucesso.' : null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Alterna o estado de bloqueio de um jogador (Bloquear / Desbloquear).
   * Rota: POST /admin/users/:id/toggle-block
   */
  async toggleBlockUser(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const { id } = req.params;
      const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';

      await AdminService.toggleUserBlock(adminId, id, clientIp);

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: 'Status de acesso do jogador alterado com sucesso.'
        });
      }

      return res.redirect('/admin/users?success=status_updated');
    } catch (error) {
      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.status(error.statusCode || 400).json({
          success: false,
          error: error.message
        });
      }
      next(error);
    }
  },

  /**
   * Renderiza a gestão de personagens do catálogo mestre.
   * Rota: GET /admin/characters
   */
  async characters(req, res, next) {
    try {
      const { page = 1, search } = req.query;

      const result = await CharacterService.listCharacters({
        search,
        page,
        limit: 10
      });

      res.render('admin/characters', {
        pageTitle: 'Gestão de Personagens — Administração',
        characters: result.characters,
        pagination: {
          total: result.total,
          totalPages: result.totalPages,
          currentPage: result.currentPage
        },
        constants: {
          CLASSES,
          ELEMENTS,
          RARITIES
        },
        successMessage: req.query.success ? 'Operação no personagem executada com sucesso.' : null,
        errorMessage: req.query.error || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a criação de um novo combatente com uploads binários em BYTEA.
   * Rota: POST /admin/characters
   */
  async createCharacter(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const clientIp = req.ip || '127.0.0.1';

      const newCharacter = await CharacterService.createCharacter(req.body, req.files || {});

      await AdminService.logAdminAction(
        adminId,
        'CHARACTER_CREATED',
        'characters',
        newCharacter.id,
        clientIp,
        { name: newCharacter.name, rarity: newCharacter.rarity, element: newCharacter.element }
      );

      return res.redirect('/admin/characters?success=created');
    } catch (error) {
      if (error.statusCode === 400) {
        return res.redirect(`/admin/characters?error=${encodeURIComponent(error.message)}`);
      }
      next(error);
    }
  },

  /**
   * Processa a atualização de um combatente existente.
   * Rota: POST /admin/characters/:id/update
   */
  async updateCharacter(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const { id } = req.params;
      const clientIp = req.ip || '127.0.0.1';

      const updated = await CharacterService.updateCharacter(id, req.body);

      // Se novos arquivos de arte ou avatar foram fornecidos
      if (req.files && (req.files.image || req.files.avatar)) {
        await CharacterService.updateCharacterImages(id, req.files);
      }

      await AdminService.logAdminAction(
        adminId,
        'CHARACTER_UPDATED',
        'characters',
        id,
        clientIp,
        { name: updated.name }
      );

      return res.redirect('/admin/characters?success=updated');
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 404) {
        return res.redirect(`/admin/characters?error=${encodeURIComponent(error.message)}`);
      }
      next(error);
    }
  },

  /**
   * Processa a remoção lógica de um combatente.
   * Rota: POST /admin/characters/:id/delete
   */
  async deleteCharacter(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const { id } = req.params;
      const clientIp = req.ip || '127.0.0.1';

      await CharacterService.deleteCharacter(id);

      await AdminService.logAdminAction(
        adminId,
        'CHARACTER_DELETED',
        'characters',
        id,
        clientIp,
        {}
      );

      return res.redirect('/admin/characters?success=deleted');
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a gestão de cartas táticas do catálogo global.
   * Rota: GET /admin/cards
   */
  async cards(req, res, next) {
    try {
      const { page = 1, search } = req.query;

      const result = await CardService.listCards({
        search,
        page,
        limit: 12
      });

      res.render('admin/cards', {
        pageTitle: 'Gestão de Cartas Táticas — Administração',
        cards: result.cards,
        pagination: {
          total: result.total,
          totalPages: result.totalPages,
          currentPage: result.currentPage
        },
        constants: {
          CARD_TYPES,
          ELEMENTS,
          RARITIES
        },
        successMessage: req.query.success ? 'Operação na carta realizada com sucesso.' : null,
        errorMessage: req.query.error || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a criação de uma nova carta tática com imagem em BYTEA.
   * Rota: POST /admin/cards
   */
  async createCard(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const clientIp = req.ip || '127.0.0.1';

      const newCard = await CardService.createCard(req.body, req.file || null);

      await AdminService.logAdminAction(
        adminId,
        'CARD_CREATED',
        'cards',
        newCard.id,
        clientIp,
        { name: newCard.name, type: newCard.type, energy_cost: newCard.energy_cost }
      );

      return res.redirect('/admin/cards?success=created');
    } catch (error) {
      if (error.statusCode === 400) {
        return res.redirect(`/admin/cards?error=${encodeURIComponent(error.message)}`);
      }
      next(error);
    }
  },

  /**
   * Processa a atualização de propriedades de uma carta tática.
   * Rota: POST /admin/cards/:id/update
   */
  async updateCard(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const { id } = req.params;
      const clientIp = req.ip || '127.0.0.1';

      const updated = await CardService.updateCard(id, req.body);

      if (req.file) {
        await CardService.updateCardImage(id, req.file);
      }

      await AdminService.logAdminAction(
        adminId,
        'CARD_UPDATED',
        'cards',
        id,
        clientIp,
        { name: updated.name }
      );

      return res.redirect('/admin/cards?success=updated');
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 404) {
        return res.redirect(`/admin/cards?error=${encodeURIComponent(error.message)}`);
      }
      next(error);
    }
  },

  /**
   * Remove logicamente uma carta do catálogo.
   * Rota: POST /admin/cards/:id/delete
   */
  async deleteCard(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const { id } = req.params;
      const clientIp = req.ip || '127.0.0.1';

      await CardService.deleteCard(id);

      await AdminService.logAdminAction(
        adminId,
        'CARD_DELETED',
        'cards',
        id,
        clientIp,
        {}
      );

      return res.redirect('/admin/cards?success=deleted');
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a supervisão de batalhas com registros e telemetria.
   * Rota: GET /admin/battles
   */
  async battles(req, res, next) {
    try {
      const recentBattles = await BattleModel.getRecentBattles(25);
      const totalCount = await BattleModel.count();

      res.render('admin/battles', {
        pageTitle: 'Supervisão de Batalhas — Administração',
        battles: recentBattles,
        totalBattles: totalCount
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a gestão de missões cadastradas.
   * Rota: GET /admin/missions
   */
  async missions(req, res, next) {
    try {
      const { page = 1 } = req.query;

      const result = await MissionService.listAllMissions({
        page,
        limit: 15
      });

      res.render('admin/missions', {
        pageTitle: 'Gestão de Missões — Administração',
        missions: result.missions,
        pagination: {
          total: result.total,
          totalPages: Math.ceil(result.total / 15) || 1,
          currentPage: Math.max(1, parseInt(page, 10) || 1)
        },
        constants: {
          MISSION_CATEGORIES,
          MISSION_REQUIREMENTS
        },
        successMessage: req.query.success ? 'Operação na missão realizada com sucesso.' : null,
        errorMessage: req.query.error || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cria uma nova missão mestre.
   * Rota: POST /admin/missions
   */
  async createMission(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const clientIp = req.ip || '127.0.0.1';

      const newMission = await MissionService.createMission(req.body);

      await AdminService.logAdminAction(
        adminId,
        'MISSION_CREATED',
        'missions',
        newMission.id,
        clientIp,
        { title: newMission.title }
      );

      return res.redirect('/admin/missions?success=created');
    } catch (error) {
      return res.redirect(`/admin/missions?error=${encodeURIComponent(error.message)}`);
    }
  },

  /**
   * Remove logicamente uma missão.
   * Rota: POST /admin/missions/:id/delete
   */
  async deleteMission(req, res, next) {
    try {
      const adminId = req.session.user.id;
      const { id } = req.params;
      const clientIp = req.ip || '127.0.0.1';

      await MissionService.deleteMission(id);

      await AdminService.logAdminAction(
        adminId,
        'MISSION_DELETED',
        'missions',
        id,
        clientIp,
        {}
      );

      return res.redirect('/admin/missions?success=deleted');
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a trilha de auditoria e registros de ações administrativas.
   * Rota: GET /admin/logs
   */
  async logs(req, res, next) {
    try {
      const { page = 1, actionName } = req.query;

      const result = await AdminService.getAuditLogs({
        page,
        limit: 25,
        actionName
      });

      res.render('admin/logs', {
        pageTitle: 'Trilha de Auditoria Administrativa — Joker RPG',
        logs: result.logs,
        pagination: {
          total: result.total,
          totalPages: result.totalPages,
          currentPage: result.currentPage
        },
        actionFilter: actionName || ''
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = AdminController;