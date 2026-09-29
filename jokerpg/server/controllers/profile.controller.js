/**
 * Joker RPG — Controlador de Perfil do Jogador (Profile Controller)
 * Gerencia a exibição da folha de combatente, atualização de nome e herói principal,
 * upload de avatar customizado em BYTEA e alteração de senha.
 */

const UserService = require('../services/user.service');
const CharacterService = require('../services/character.service');

const ProfileController = {
  /**
   * Renderiza a página de perfil consolidado do combatente.
   * Rota: GET /profile
   */
  async showProfile(req, res, next) {
    try {
      const userId = req.session.user.id;
      const profile = await UserService.getUserProfile(userId);

      const successParam = req.query.success;
      const errorParam = req.query.error;

      let successMessage = null;
      let errorMessage = null;

      if (successParam === 'profile_updated') {
        successMessage = 'Perfil atualizado com sucesso.';
      } else if (successParam === 'avatar_updated') {
        successMessage = 'Avatar de combate atualizado com êxito.';
      } else if (successParam === 'password_changed') {
        successMessage = 'Sua senha foi redefinida com segurança.';
      }

      if (errorParam === 'upload_failed') {
        errorMessage = 'Falha ao processar o upload do avatar.';
      }

      res.render('profile/index', {
        pageTitle: `Perfil de ${profile.username} — Joker RPG`,
        profile,
        successMessage,
        errorMessage,
        errors: []
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa a atualização de dados cadastrais (nome de usuário e combatente principal).
   * Rota: POST /profile/update
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { username, mainCharacterId } = req.body;

      const updatedUser = await UserService.updateProfile(userId, {
        username,
        mainCharacterId
      });

      // Atualiza os dados refletidos na sessão
      req.session.user.username = updatedUser.username;
      req.session.user.main_character_id = updatedUser.main_character_id;
      req.session.user.power_index = updatedUser.power_index;

      req.session.save((err) => {
        if (err) return next(err);
        return res.redirect('/profile?success=profile_updated');
      });
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 404) {
        const profile = await UserService.getUserProfile(req.session.user.id);
        return res.status(error.statusCode).render('profile/index', {
          pageTitle: `Perfil de ${profile.username} — Joker RPG`,
          profile,
          successMessage: null,
          errorMessage: error.message,
          errors: [error.message]
        });
      }
      next(error);
    }
  },

  /**
   * Processa o upload de novo avatar dinâmico do jogador (BYTEA).
   * Rota: POST /profile/avatar
   */
  async updateAvatar(req, res, next) {
    try {
      const userId = req.session.user.id;
      const file = req.file;

      if (!file) {
        return res.redirect('/profile?error=upload_failed');
      }

      await UserService.updateAvatar(userId, file);
      return res.redirect('/profile?success=avatar_updated');
    } catch (error) {
      if (error.statusCode === 400) {
        const profile = await UserService.getUserProfile(req.session.user.id);
        return res.status(400).render('profile/index', {
          pageTitle: `Perfil de ${profile.username} — Joker RPG`,
          profile,
          successMessage: null,
          errorMessage: error.message,
          errors: [error.message]
        });
      }
      next(error);
    }
  },

  /**
   * Processa a troca de senha autenticada da conta.
   * Rota: POST /profile/change-password
   */
  async changePassword(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { currentPassword, newPassword, confirmNewPassword } = req.body;

      if (newPassword !== confirmNewPassword) {
        const profile = await UserService.getUserProfile(userId);
        return res.status(400).render('profile/index', {
          pageTitle: `Perfil de ${profile.username} — Joker RPG`,
          profile,
          successMessage: null,
          errorMessage: 'A confirmação da nova senha não coincide.',
          errors: ['A confirmação da nova senha não coincide.']
        });
      }

      await UserService.changePassword(userId, currentPassword, newPassword);
      return res.redirect('/profile?success=password_changed');
    } catch (error) {
      if (error.statusCode === 400) {
        const profile = await UserService.getUserProfile(req.session.user.id);
        return res.status(400).render('profile/index', {
          pageTitle: `Perfil de ${profile.username} — Joker RPG`,
          profile,
          successMessage: null,
          errorMessage: error.message,
          errors: [error.message]
        });
      }
      next(error);
    }
  }
};

module.exports = ProfileController;