/**
 * Joker RPG — Serviço de Autenticação Google OAuth 2.0 (GoogleAuth Service)
 * Orquestra a troca segura de código de autorização, validação de tokens de identidade (ID Token),
 * vinculação a contas existentes e provisionamento de novos combatentes via login social.
 */

const { OAuth2Client } = require('google-auth-library');
const config = require('../config/env.config');
const UserModel = require('../models/user.model');
const CharacterModel = require('../models/character.model');
const CardModel = require('../models/card.model');
const DeckModel = require('../models/deck.model');
const MissionModel = require('../models/mission.model');
const PowerService = require('./power.service');
const { withTransaction } = require('../../database/connection');

let oauth2Client = null;

if (config.googleOAuth.clientId && config.googleOAuth.clientSecret) {
  oauth2Client = new OAuth2Client(
    config.googleOAuth.clientId,
    config.googleOAuth.clientSecret,
    config.googleOAuth.callbackUrl
  );
}

const GoogleAuthService = {
  /**
   * Verifica se a integração com Google OAuth está devidamente configurada.
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(oauth2Client && config.googleOAuth.clientId && config.googleOAuth.clientSecret);
  },

  /**
   * Gera a URL de redirecionamento para autorização na Google.
   * @param {string} state - Token anti-CSRF para validação no callback
   * @returns {string} URL de autenticação
   */
  getAuthUrl(state) {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth 2.0 não configurado nas variáveis de ambiente.');
    }

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'profile', 'email'],
      prompt: 'select_account',
      state
    });
  },

  /**
   * Processa o código retornado pela Google no callback, valida a assinatura do ID Token
   * e extrai os dados do perfil do usuário.
   * @param {string} code - Código de autorização retornado pela Google
   * @returns {Promise<object>} Dados do perfil { sub, email, name, picture }
   */
  async exchangeCodeForProfile(code) {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth 2.0 não está habilitado.');
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.googleOAuth.clientId
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Falha ao obter os dados de e-mail a partir do perfil Google.');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      name: payload.name || 'Guerreiro Joker',
      picture: payload.picture || null
    };
  },

  /**
   * Localiza uma conta vinculada ao Google ID, associa a uma conta com o mesmo e-mail,
   * ou registra um novo jogador com a concessão do kit inicial completo.
   * @param {object} profile - Perfil retornado pela Google { sub, email, name, picture }
   * @returns {Promise<object>} Usuário autenticado
   */
  async findOrCreateUser(profile) {
    const { sub, email, name } = profile;

    // 1. Verifica se já existe um vínculo com o provider_user_id (Google Sub)
    const existingOAuthUser = await UserModel.findOAuth('google', sub);
    if (existingOAuthUser) {
      if (existingOAuthUser.is_blocked) {
        const error = new Error('Esta conta encontra-se suspensa pela administração.');
        error.statusCode = 403;
        throw error;
      }
      return await UserModel.findById(existingOAuthUser.user_id);
    }

    // 2. Verifica se já existe uma conta local com o mesmo endereço de e-mail
    const existingLocalUser = await UserModel.findByEmail(email);
    if (existingLocalUser) {
      if (existingLocalUser.is_blocked) {
        const error = new Error('Esta conta encontra-se suspensa pela administração.');
        error.statusCode = 403;
        throw error;
      }

      // Vincula a credencial Google à conta existente
      await UserModel.createOAuth(existingLocalUser.id, 'google', sub);
      return await UserModel.findById(existingLocalUser.id);
    }

    // 3. Caso o usuário não exista, cria uma nova conta e concede o kit inicial em transação
    let baseUsername = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (baseUsername.length < 3) baseUsername = `user_${sub.slice(0, 5)}`;
    if (baseUsername.length > 25) baseUsername = baseUsername.slice(0, 25);

    // Garante unicidade do nome de usuário gerado
    let candidateUsername = baseUsername;
    let suffix = 1;
    while (await UserModel.findByUsername(candidateUsername)) {
      candidateUsername = `${baseUsername}_${suffix}`;
      suffix++;
    }

    return await withTransaction(async (client) => {
      // 3.1 Criação do Usuário
      const newUser = await UserModel.create({
        username: candidateUsername,
        email,
        role: 'USER_NORMAL'
      }, client);

      // 3.2 Vinculação do registro OAuth
      await UserModel.createOAuth(newUser.id, 'google', sub, client);

      // 3.3 Desbloqueio do Personagem Inicial
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

      // 3.4 Concessão das 10 Cartas Canônicas
      const cardsResult = await CardModel.findAll({ limit: 10 });
      const starterCards = cardsResult.cards;

      const starterCardIds = [];
      for (const card of starterCards) {
        await CardModel.addCardToUser(newUser.id, card.id, 1, client);
        starterCardIds.push(card.id);
      }

      // 3.5 Montagem do Baralho Inicial
      if (starterCardIds.length >= 10) {
        const starterDeck = await DeckModel.create({
          userId: newUser.id,
          name: 'Baralho Inicial Tático',
          isActive: true
        }, client);

        await DeckModel.setCards(starterDeck.id, starterCardIds.slice(0, 10), client);
      }

      // 3.6 Inicialização das Missões
      await MissionModel.initUserMissions(newUser.id, client);

      // 3.7 Cálculo do Poder Inicial
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
  }
};

module.exports = GoogleAuthService;