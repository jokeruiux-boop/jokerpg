/**
 * Joker RPG — Serviço de Personagens e Habilidades (Character Service)
 * Orquestra o ciclo de vida dos heróis: criação administrativa, cálculo de atributos de combate,
 * upload de assets visuais em BYTEA e desbloqueio de personagens para os jogadores.
 */

const CharacterModel = require('../models/character.model');
const PowerService = require('./power.service');
const UserModel = require('../models/user.model');

const CharacterService = {
  /**
   * Retorna listagem paginada e filtrada de combatentes do catálogo mestre.
   * @param {object} filters - Filtros de busca (rarity, element, characterClass, search, page, limit)
   * @returns {Promise<{ characters: Array, total: number, totalPages: number, currentPage: number }>}
   */
  async listCharacters(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(filters.limit, 10) || 12));

    const result = await CharacterModel.findAll({
      ...filters,
      page,
      limit
    });

    const totalPages = Math.ceil(result.total / limit) || 1;

    return {
      characters: result.characters,
      total: result.total,
      totalPages,
      currentPage: page
    };
  },

  /**
   * Localiza um combatente pelo seu identificador UUID.
   * @param {string} id - UUID do personagem
   * @returns {Promise<object>}
   */
  async getCharacterById(id) {
    const character = await CharacterModel.findById(id);
    if (!character) {
      const error = new Error('Personagem não encontrado no catálogo.');
      error.statusCode = 404;
      throw error;
    }
    return character;
  },

  /**
   * Cria um novo personagem canônico no catálogo global (Operação Administrativa).
   * Calcula automaticamente o Power Rating com base na fórmula do PowerService e armazena artes binárias.
   * @param {object} data - Atributos técnicos do combatente
   * @param {object} [files={}] - Arquivos recebidos pelo Multer ({ image, avatar })
   * @returns {Promise<object>} Personagem criado
   */
  async createCharacter(data, files = {}) {
    const existing = await CharacterModel.findByName(data.name);
    if (existing) {
      const error = new Error(`Já existe um personagem registrado com o nome '${data.name}'.`);
      error.statusCode = 400;
      throw error;
    }

    // Calcula o poder estatístico padrão de nível 1 do combatente
    const powerRating = PowerService.calculateCharacterPower(data, 1);

    const characterData = {
      ...data,
      power_rating: powerRating,
      imageData: (files.image && files.image[0]) ? files.image[0].buffer : null,
      imageMime: (files.image && files.image[0]) ? files.image[0].mimetype : null,
      avatarData: (files.avatar && files.avatar[0]) ? files.avatar[0].buffer : null,
      avatarMime: (files.avatar && files.avatar[0]) ? files.avatar[0].mimetype : null
    };

    return await CharacterModel.create(characterData);
  },

  /**
   * Atualiza as estatísticas e habilidades de um combatente.
   * @param {string} id - UUID do personagem
   * @param {object} data - Novos atributos
   * @returns {Promise<object>} Personagem atualizado
   */
  async updateCharacter(id, data) {
    const character = await this.getCharacterById(id);

    // Recalcula o poder de combate caso atributos base tenham sido modificados
    const powerRating = PowerService.calculateCharacterPower({
      ...character,
      ...data
    }, 1);

    return await CharacterModel.update(id, {
      ...data,
      power_rating: powerRating
    });
  },

  /**
   * Atualiza as ilustrações binárias do personagem no PostgreSQL em BYTEA.
   * @param {string} id - UUID do personagem
   * @param {object} files - Arquivos de upload ({ image, avatar })
   * @returns {Promise<void>}
   */
  async updateCharacterImages(id, files) {
    await this.getCharacterById(id);

    const imageData = (files.image && files.image[0]) ? files.image[0].buffer : null;
    const imageMime = (files.image && files.image[0]) ? files.image[0].mimetype : null;
    const avatarData = (files.avatar && files.avatar[0]) ? files.avatar[0].buffer : null;
    const avatarMime = (files.avatar && files.avatar[0]) ? files.avatar[0].mimetype : null;

    if (!imageData && !avatarData) {
      const error = new Error('Nenhum arquivo de imagem válido foi enviado para atualização.');
      error.statusCode = 400;
      throw error;
    }

    await CharacterModel.updateImages(id, {
      imageData,
      imageMime,
      avatarData,
      avatarMime
    });
  },

  /**
   * Remove logicamente (Soft Delete) um personagem do catálogo mestre.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteCharacter(id) {
    await this.getCharacterById(id);
    await CharacterModel.softDelete(id);
  },

  /**
   * Retorna os combatentes desbloqueados e pertencentes ao jogador.
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getUserCharacters(userId) {
    return await CharacterModel.findUserCharacters(userId);
  },

  /**
   * Concede e desbloqueia um personagem para a conta do usuário.
   * @param {string} userId
   * @param {string} characterId
   * @returns {Promise<object>} Registro de desbloqueio
   */
  async unlockCharacterForUser(userId, characterId) {
    const character = await this.getCharacterById(characterId);
    const user = await UserModel.findById(userId);

    if (!user) {
      const error = new Error('Jogador não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const alreadyUnlocked = await CharacterModel.isUnlockedByUser(userId, characterId);
    if (alreadyUnlocked) {
      const error = new Error(`O personagem '${character.name}' já está desbloqueado.`);
      error.statusCode = 400;
      throw error;
    }

    const result = await CharacterModel.unlockForUser(userId, characterId);

    // Se o usuário ainda não tiver um combatente principal, define o novo personagem
    if (!user.main_character_id) {
      await UserModel.updateProfile(userId, { mainCharacterId: characterId });
    }

    // Recalcula o poder da conta
    await PowerService.recalculateAndPersistUserPower(userId);

    return result;
  },

  /**
   * Recupera a arte principal do combatente em BYTEA.
   * @param {string} id
   * @returns {Promise<object|null>} { image_data, image_mime }
   */
  async getCharacterImage(id) {
    return await CharacterModel.getImage(id);
  },

  /**
   * Recupera o avatar em miniatura do combatente em BYTEA.
   * @param {string} id
   * @returns {Promise<object|null>} { avatar_data, avatar_mime }
   */
  async getCharacterAvatar(id) {
    return await CharacterModel.getAvatar(id);
  }
};

module.exports = CharacterService;