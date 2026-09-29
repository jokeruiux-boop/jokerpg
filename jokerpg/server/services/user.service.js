/**
 * Joker RPG — Serviço de Usuários e Gestão de Perfil (User Service)
 * Coordena consulta de perfis, alteração segura de dados cadastrais,
 * upload de avatares dinâmicos em BYTEA e alteração de senhas autenticadas.
 */

const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const BattleModel = require('../models/battle.model');
const RankingModel = require('../models/ranking.model');
const PowerService = require('./power.service');

const UserService = {
  /**
   * Obtém o perfil completo e consolidado de um jogador:
   * Dados da conta, personagem principal equipado, estatísticas de combate (W/L) e posição no ranking.
   * @param {string} userId - UUID do jogador
   * @returns {Promise<object>} Perfil consolidado
   */
  async getUserProfile(userId) {
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('Jogador não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    // Coleta dados de combate (Vitórias, Derrotas e Total de Batalhas)
    const stats = await BattleModel.getUserStats(userId);

    // Coleta posição e pontuação atual na classificação global
    const ranking = await RankingModel.getUserRanking(userId);

    // Coleta lista de personagens desbloqueados pelo combatente
    const userCharacters = await CharacterModel.findUserCharacters(userId);

    return {
      ...user,
      stats: {
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        totalBattles: stats.total || 0,
        winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0
      },
      ranking: {
        rating: ranking ? ranking.rating : 1000,
        position: ranking ? ranking.rank_position : 'N/A'
      },
      unlockedCharacters: userCharacters
    };
  },

  /**
   * Atualiza as informações permitidas do perfil (nome de usuário e personagem principal).
   * O servidor valida unicidade e impede qualquer manipulação de XP, moedas ou nível.
   * @param {string} userId
   * @param {object} updateData
   * @param {string} [updateData.username]
   * @param {string} [updateData.mainCharacterId]
   * @returns {Promise<object>} Usuário atualizado
   */
  async updateProfile(userId, { username, mainCharacterId }) {
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('Usuário não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    let cleanUsername = user.username;
    if (username && username.trim() !== user.username) {
      cleanUsername = username.trim();
      const existing = await UserModel.findByUsername(cleanUsername);
      if (existing && existing.id !== userId) {
        const error = new Error('O nome de usuário desejado já está em uso.');
        error.statusCode = 400;
        throw error;
      }
    }

    let targetMainCharId = user.main_character_id;
    if (mainCharacterId) {
      // Valida se o usuário é proprietário do personagem que deseja equipar como principal
      const isUnlocked = await CharacterModel.isUnlockedByUser(userId, mainCharacterId);
      if (!isUnlocked) {
        const error = new Error('Você precisa desbloquear este personagem antes de equipá-lo como principal.');
        error.statusCode = 400;
        throw error;
      }
      targetMainCharId = mainCharacterId;
    }

    const updatedUser = await UserModel.updateProfile(userId, {
      username: cleanUsername,
      mainCharacterId: targetMainCharId
    });

    // Recalcula o poder da conta após a eventual alteração de combatente principal
    await PowerService.recalculateAndPersistUserPower(userId);

    return await UserModel.findById(userId);
  },

  /**
   * Atualiza o avatar dinâmico do jogador armazenando o binário diretamente no PostgreSQL via BYTEA.
   * @param {string} userId
   * @param {object} file - Objeto de arquivo fornecido pelo middleware Multer
   * @returns {Promise<void>}
   */
  async updateAvatar(userId, file) {
    if (!file || !file.buffer) {
      const error = new Error('Nenhum arquivo de imagem válido foi recebido.');
      error.statusCode = 400;
      throw error;
    }

    await UserModel.updateAvatar(userId, file.buffer, file.mimetype);
  },

  /**
   * Obtém o binário e o tipo MIME do avatar do usuário para transmissão HTTP.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getAvatar(userId) {
    return await UserModel.getAvatar(userId);
  },

  /**
   * Altera a senha da conta de um usuário já autenticado.
   * @param {string} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<void>}
   */
  async changePassword(userId, currentPassword, newPassword) {
    const passwordHash = await UserModel.findAuthByUserId(userId);
    if (!passwordHash) {
      const error = new Error('Esta conta não utiliza autenticação por senha local.');
      error.statusCode = 400;
      throw error;
    }

    const isMatch = await bcrypt.compare(currentPassword, passwordHash);
    if (!isMatch) {
      const error = new Error('A senha atual informada está incorreta.');
      error.statusCode = 400;
      throw error;
    }

    if (newPassword.length < 8) {
      const error = new Error('A nova senha deve possuir no mínimo 8 caracteres.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await UserModel.updatePasswordHash(userId, newPasswordHash);
  }
};

module.exports = UserService;