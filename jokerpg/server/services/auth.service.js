/**
 * Joker RPG — Serviço de Autenticação e Gestão de Contas (Auth Service)
 * Orquestra registro de novos jogadores com concessão de kit inicial (personagem, deck e cartas),
 * conferência segura de senhas via Bcrypt e ciclo de vida de tokens de redefinição de acesso.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const CardModel = require('../models/card.model');
const DeckModel = require('../models/deck.model');
const MissionModel = require('../models/mission.model');
const PowerService = require('./power.service');
const { withTransaction } = require('../../database/connection');
const config = require('../config/env.config');

const AuthService = {
  /**
   * Registra um novo jogador no Joker RPG executando a concessão do kit inicial em transação atômica:
   * 1. Cria usuário e credencial hash (salt 12).
   * 2. Desbloqueia o personagem inicial canônico e define como principal.
   * 3. Atribui o conjunto inicial de 10 cartas colecionáveis ao inventário.
   * 4. Constrói e ativa o primeiro baralho (Deck Inicial).
   * 5. Inicializa o vínculo com as missões vigentes.
   * 6. Calcula e persiste o índice de poder inicial do jogador.
   * 
   * @param {object} params
   * @param {string} params.username
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<object>} Usuário criado
   */
  async register({ username, email, password }) {
    const existingEmail = await UserModel.findByEmail(email);
    if (existingEmail) {
      const error = new Error('O endereço de e-mail informado já se encontra cadastrado.');
      error.statusCode = 400;
      throw error;
    }

    const existingUsername = await UserModel.findByUsername(username);
    if (existingUsername) {
      const error = new Error('O nome de usuário escolhido já está em uso por outro combatente.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    return await withTransaction(async (client) => {
      // 1. Criação do Usuário
      const newUser = await UserModel.create({
        username,
        email,
        role: 'USER_NORMAL'
      }, client);

      // 2. Registro da Credencial de Acesso
      await UserModel.createAuth(newUser.id, passwordHash, client);

      // 3. Localização do Personagem Inicial (Fallback para o primeiro personagem cadastrado)
      let starterChar = await CharacterModel.findByName('Aqua, a Sentinela das Marés');
      if (!starterChar) {
        const charList = await CharacterModel.findAll({ limit: 1 });
        starterChar = charList.characters[0] || null;
      }

      if (starterChar) {
        await CharacterModel.unlockForUser(newUser.id, starterChar.id, client);
        await client.query('UPDATE users SET main_character_id = $1 WHERE id = $2;', [starterChar.id, newUser.id]);
        newUser.main_character_id = starterChar.id;
      }

      // 4. Seleção e Inserção das 10 Cartas Iniciais no Inventário
      const cardsResult = await CardModel.findAll({ limit: 10 });
      const starterCards = cardsResult.cards;

      const starterCardIds = [];
      for (const card of starterCards) {
        await CardModel.addCardToUser(newUser.id, card.id, 1, client);
        starterCardIds.push(card.id);
      }

      // 5. Criação e Ativação do Baralho Inicial Regulamentar
      if (starterCardIds.length >= 10) {
        const starterDeck = await DeckModel.create({
          userId: newUser.id,
          name: 'Baralho Inicial Tático',
          isActive: true
        }, client);

        await DeckModel.setCards(starterDeck.id, starterCardIds.slice(0, 10), client);
      }

      // 6. Vinculação das Missões Iniciais
      await MissionModel.initUserMissions(newUser.id, client);

      // 7. Cálculo e Registro do Poder de Combate Inicial
      const calculatedPower = PowerService.calculatePlayerPower(newUser, starterChar, starterCards);
      await UserModel.updateProgression(
        newUser.id,
        {
          level: 1,
          xp: 0,
          coins: 100,
          powerIndex: calculatedPower
        },
        client
      );

      newUser.power_index = calculatedPower;
      return newUser;
    });
  },

  /**
   * Autentica um jogador validando e-mail, senha criptografada e status de bloqueio.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} Usuário autenticado
   */
  async login(email, password) {
    const user = await UserModel.findByEmail(email);
    if (!user) {
      const error = new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
      error.statusCode = 401;
      throw error;
    }

    if (user.is_blocked) {
      const error = new Error('Esta conta encontra-se temporariamente suspensa pela administração.');
      error.statusCode = 403;
      throw error;
    }

    const passwordHash = await UserModel.findAuthByUserId(user.id);
    if (!passwordHash) {
      const error = new Error('Conta associada a provedor externo (Google). Utilize o login social correspondente.');
      error.statusCode = 400;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, passwordHash);
    if (!isMatch) {
      const error = new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
      error.statusCode = 401;
      throw error;
    }

    // Carrega dados completos do usuário incluindo o personagem principal
    return await UserModel.findById(user.id);
  },

  /**
   * Inicia o fluxo de recuperação de senha gerando token seguro de uso único.
   * @param {string} email
   * @returns {Promise<{ success: boolean, token: string|null }>}
   */
  async requestPasswordReset(email) {
    const user = await UserModel.findByEmail(email);
    if (!user || user.is_blocked) {
      // Resposta neutra para mitigar ataques de enumeração de e-mails
      return { success: true, token: null };
    }

    // Gera token criptográfico aleatório de 32 bytes
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora de validade

    await UserModel.createPasswordResetToken(user.id, tokenHash, expiresAt);

    if (!config.isProduction) {
      console.log(`[AUTH SERVICE - DEV] Link de recuperação para ${email}: ${config.appUrl}/auth/reset-password?token=${rawToken}`);
    }

    return {
      success: true,
      token: rawToken
    };
  },

  /**
   * Redefine a senha do usuário utilizando o token previamente validado.
   * @param {string} rawToken
   * @param {string} newPassword
   * @returns {Promise<void>}
   */
  async resetPassword(rawToken, newPassword) {
    if (!rawToken || typeof rawToken !== 'string') {
      const error = new Error('Token de redefinição inválido.');
      error.statusCode = 400;
      throw error;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    const tokenRecord = await UserModel.findPasswordResetToken(tokenHash);

    if (!tokenRecord) {
      const error = new Error('O link de recuperação expirou ou já foi utilizado. Solicite um novo pedido.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await withTransaction(async (client) => {
      await UserModel.updatePasswordHash(tokenRecord.user_id, newPasswordHash, client);
      await UserModel.markPasswordResetTokenUsed(tokenRecord.id, client);
    });
  }
};

module.exports = AuthService;