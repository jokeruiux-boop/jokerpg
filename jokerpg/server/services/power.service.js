/**
 * Joker RPG — Serviço de Cálculo de Poder (Power Service)
 * Determina o índice de poder de combate (Power Rating) com base em atributos primários,
 * afinidades de raridade, níveis de personagem e sinergia média do baralho ativo.
 */

const { RARITY_MULTIPLIERS } = require('../config/constants');
const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const DeckModel = require('../models/deck.model');

const PowerService = {
  /**
   * Calcula o poder individual de um personagem considerando seus atributos e nível de progressão.
   * @param {object} character - Objeto com os atributos do personagem
   * @param {number} [level=1] - Nível atual do personagem
   * @returns {number}
   */
  calculateCharacterPower(character, level = 1) {
    if (!character) return 0;

    const baseHp = Number(character.base_hp) || 800;
    const attack = Number(character.attack) || 50;
    const defense = Number(character.defense) || 50;
    const speed = Number(character.speed) || 50;
    const criticalChance = Number(character.critical_chance) || 5.0;
    const rarity = character.rarity || 'COMMON';

    // Fator de escala por nível (cada nível acima do 1 adiciona 3.5% aos valores ponderados)
    const levelFactor = 1 + ((level - 1) * 0.035);
    const rarityMultiplier = RARITY_MULTIPLIERS[rarity] || 1.0;

    // Ponderação estrita de atributos
    const weightedHp = (baseHp * 0.25);
    const weightedAttack = (attack * 1.85);
    const weightedDefense = (defense * 1.45);
    const weightedSpeed = (speed * 1.20);
    const weightedCrit = (criticalChance * 8.5);

    const baseAttributesSum = weightedHp + weightedAttack + weightedDefense + weightedSpeed + weightedCrit;
    const totalPower = Math.round(baseAttributesSum * levelFactor * rarityMultiplier);

    return Math.max(10, totalPower);
  },

  /**
   * Calcula o poder global representativo da conta do jogador.
   * Integra o nível da conta, personagem principal e cartas equipadas no baralho ativo.
   * @param {object} user - Dados do usuário (level, etc.)
   * @param {object|null} mainCharacter - Dados do personagem principal
   * @param {Array} [activeDeckCards=[]] - Lista de cartas contidas no baralho ativo
   * @returns {number}
   */
  calculatePlayerPower(user, mainCharacter = null, activeDeckCards = []) {
    const userLevel = Number(user.level) || 1;
    const characterPower = mainCharacter
      ? this.calculateCharacterPower(mainCharacter, userLevel)
      : (userLevel * 120);

    // Avaliação tática da média de dano e quebra de postura do baralho ativo
    let deckContribution = 0;
    if (Array.isArray(activeDeckCards) && activeDeckCards.length > 0) {
      const totalCardDamage = activeDeckCards.reduce((acc, card) => acc + (Number(card.damage) || 0), 0);
      const totalCardBreak = activeDeckCards.reduce((acc, card) => acc + (Number(card.break_damage) || 0), 0);
      const totalCardDefense = activeDeckCards.reduce((acc, card) => acc + (Number(card.defense) || 0), 0);

      const avgDamage = totalCardDamage / activeDeckCards.length;
      const avgBreak = totalCardBreak / activeDeckCards.length;
      const avgDefense = totalCardDefense / activeDeckCards.length;

      deckContribution = Math.round((avgDamage * 1.5) + (avgBreak * 2.2) + (avgDefense * 1.1));
    }

    const accountBonus = userLevel * 45;
    const totalPlayerPower = Math.round(characterPower + deckContribution + accountBonus);

    return Math.max(100, totalPlayerPower);
  },

  /**
   * Recalcula o poder global do usuário consultando o estado do banco e persiste a alteração de forma atômica.
   * @param {string} userId - UUID do usuário
   * @param {object} [client] - Cliente opcional de transação
   * @returns {Promise<number>}
   */
  async recalculateAndPersistUserPower(userId, client = null) {
    const user = await UserModel.findById(userId, client);
    if (!user) return 0;

    let mainCharacter = null;
    if (user.main_character_id) {
      mainCharacter = await CharacterModel.findById(user.main_character_id, client);
    }

    const activeDeck = await DeckModel.findActiveByUserId(userId, client);
    const activeDeckCards = (activeDeck && activeDeck.cards) ? activeDeck.cards : [];

    const calculatedPower = this.calculatePlayerPower(user, mainCharacter, activeDeckCards);

    await UserModel.updateProgression(
      userId,
      {
        level: user.level,
        xp: user.xp,
        coins: user.coins,
        powerIndex: calculatedPower
      },
      client
    );

    return calculatedPower;
  }
};

module.exports = PowerService;