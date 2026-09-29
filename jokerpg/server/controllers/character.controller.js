/**
 * Joker RPG — Controlador de Personagens (Character Controller)
 * Gerencia a navegação pelo catálogo de heróis, visualização de fichas técnicas detalhadas,
 * desbloqueio de novos combatentes e seleção do combatente principal da conta.
 */

const CharacterService = require('../services/character.service');
const UserService = require('../services/user.service');
const { CLASSES, ELEMENTS, RARITIES } = require('../config/constants');

const CharacterController = {
  /**
   * Renderiza a listagem de personagens com filtros elementais, de classe e raridade.
   * Rota: GET /characters
   */
  async list(req, res, next) {
    try {
      const {
        rarity,
        element,
        class: characterClass,
        search,
        page = 1
      } = req.query;

      const userId = req.session.user.id;

      // Executa consulta paralela do catálogo e dos combatentes que o usuário já desbloqueou
      const [catalogResult, userCharacters] = await Promise.all([
        CharacterService.listCharacters({
          rarity,
          element,
          characterClass,
          search,
          page,
          limit: 12
        }),
        CharacterService.getUserCharacters(userId)
      ]);

      const unlockedIds = new Set(userCharacters.map((uc) => uc.character_id));

      res.render('characters/list', {
        pageTitle: 'Galeria de Personagens — Joker RPG',
        characters: catalogResult.characters,
        pagination: {
          total: catalogResult.total,
          totalPages: catalogResult.totalPages,
          currentPage: catalogResult.currentPage
        },
        filters: {
          rarity: rarity || '',
          element: element || '',
          class: characterClass || '',
          search: search || ''
        },
        constants: {
          CLASSES,
          ELEMENTS,
          RARITIES
        },
        unlockedIds,
        mainCharacterId: req.session.user.main_character_id
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a ficha técnica minuciosa de um combatente (atributos, passiva, ativa e ultimate).
   * Rota: GET /characters/:id
   */
  async detail(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.session.user.id;

      const [character, userCharacters] = await Promise.all([
        CharacterService.getCharacterById(id),
        CharacterService.getUserCharacters(userId)
      ]);

      const userCharacterEntry = userCharacters.find((uc) => uc.character_id === id);
      const isUnlocked = Boolean(userCharacterEntry);
      const isMain = req.session.user.main_character_id === id;

      res.render('characters/detail', {
        pageTitle: `${character.name} — Detalhes Táticos`,
        character,
        isUnlocked,
        isMain,
        userProgress: userCharacterEntry || null
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Processa o desbloqueio de um combatente para a conta do usuário.
   * Rota: POST /characters/:id/unlock
   */
  async unlock(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.session.user.id;

      await CharacterService.unlockCharacterForUser(userId, id);

      const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
      if (isJsonRequest) {
        return res.json({
          success: true,
          message: 'Combatente desbloqueado e integrado ao seu arsenal com sucesso!'
        });
      }

      return res.redirect(`/characters/${id}`);
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
   * Define o combatente como o personagem principal equipado no perfil.
   * Rota: POST /characters/:id/select-main
   */
  async selectMain(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.session.user.id;

      const updatedUser = await UserService.updateProfile(userId, {
        mainCharacterId: id
      });

      req.session.user.main_character_id = updatedUser.main_character_id;
      req.session.user.power_index = updatedUser.power_index;

      req.session.save((err) => {
        if (err) return next(err);

        const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
        if (isJsonRequest) {
          return res.json({
            success: true,
            message: 'Personagem principal equipado com sucesso!',
            mainCharacterId: id
          });
        }

        return res.redirect(`/characters/${id}`);
      });
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
  }
};

module.exports = CharacterController;