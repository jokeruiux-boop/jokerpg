/**
 * Joker RPG — Controlador de Transmissão de Imagens Dinâmicas (Image Controller)
 * Transmite buffers binários (BYTEA) persistidos no PostgreSQL diretamente ao navegador
 * com cabeçalhos de cache otimizados (HTTP 304 / Cache-Control) e fallbacks visuais.
 */

const UserService = require('../services/user.service');
const CharacterService = require('../services/character.service');
const CardService = require('../services/card.service');

const ImageController = {
  /**
   * Transmite o avatar binário do usuário a partir da coluna BYTEA.
   * Rota: GET /images/avatar/:id
   */
  async getAvatar(req, res, next) {
    try {
      const { id } = req.params;
      const avatarRecord = await UserService.getAvatar(id);

      if (!avatarRecord || !avatarRecord.avatar_data) {
        // Redireciona para o avatar padrão estático em disco
        return res.redirect('/images/default-avatar.png');
      }

      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache de 24 horas
      res.contentType(avatarRecord.avatar_mime || 'image/png');
      return res.send(avatarRecord.avatar_data);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Transmite a arte principal em alta resolução do personagem a partir de BYTEA.
   * Rota: GET /images/character/:id
   */
  async getCharacterImage(req, res, next) {
    try {
      const { id } = req.params;
      const record = await CharacterService.getCharacterImage(id);

      if (!record || !record.image_data) {
        return res.redirect('/images/default-avatar.png');
      }

      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.contentType(record.image_mime || 'image/png');
      return res.send(record.image_data);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Transmite o avatar em miniatura do personagem a partir de BYTEA.
   * Rota: GET /images/character-avatar/:id
   */
  async getCharacterAvatar(req, res, next) {
    try {
      const { id } = req.params;
      const record = await CharacterService.getCharacterAvatar(id);

      if (!record || !record.avatar_data) {
        return res.redirect('/images/default-avatar.png');
      }

      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.contentType(record.avatar_mime || 'image/png');
      return res.send(record.avatar_data);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Transmite a ilustração binária da carta tática a partir de BYTEA.
   * Rota: GET /images/card/:id
   */
  async getCardImage(req, res, next) {
    try {
      const { id } = req.params;
      const record = await CardService.getCardImage(id);

      if (!record || !record.image_data) {
        return res.redirect('/images/card-back.png');
      }

      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.contentType(record.image_mime || 'image/png');
      return res.send(record.image_data);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = ImageController;