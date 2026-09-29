/**
 * Joker RPG — Controlador de Autenticação e Ciclo de Sessão (Auth Controller)
 * Gerencia rotas de cadastro, login por credenciais locais, OAuth com Google,
 * recuperação de senhas e encerramento de sessão.
 */

const crypto = require('crypto');
const AuthService = require('../services/auth.service');
const GoogleAuthService = require('../services/googleAuth.service');
const { ROLES } = require('../config/constants');

const AuthController = {
  /**
   * Renderiza a página de criação de conta (Registro).
   * Rota: GET /auth/register
   */
  showRegister(req, res) {
    res.render('auth/register', {
      pageTitle: 'Criar Conta — Joker RPG',
      errors: [],
      formData: {}
    });
  },

  /**
   * Processa o formulário de cadastro de novo combatente.
   * Rota: POST /auth/register
   */
  async register(req, res, next) {
    try {
      const { username, email, password } = req.body;

      const newUser = await AuthService.register({
        username,
        email,
        password
      });

      // Inicializa a sessão autenticada diretamente
      req.session.user = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        level: newUser.level,
        coins: newUser.coins,
        power_index: newUser.power_index,
        main_character_id: newUser.main_character_id,
        is_blocked: false
      };

      req.session.save((err) => {
        if (err) return next(err);
        return res.redirect('/dashboard');
      });
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).render('auth/register', {
          pageTitle: 'Criar Conta — Joker RPG',
          errors: [error.message],
          formData: { username: req.body.username, email: req.body.email }
        });
      }
      next(error);
    }
  },

  /**
   * Renderiza a página de login na arena.
   * Rota: GET /auth/login
   */
  showLogin(req, res) {
    const errorParam = req.query.error;
    const errors = [];

    if (errorParam === 'account_blocked') {
      errors.push('Sua conta foi suspensa temporariamente pela administração.');
    } else if (errorParam === 'oauth_failed') {
      errors.push('Falha na autenticação com a conta Google. Tente novamente.');
    }

    const successMessage = req.query.reset === 'success'
      ? 'Senha redefinida com sucesso. Faça login com suas novas credenciais.'
      : null;

    res.render('auth/login', {
      pageTitle: 'Entrar na Arena — Joker RPG',
      errors,
      successMessage,
      formData: {}
    });
  },

  /**
   * Processa a autenticação com e-mail e senha.
   * Rota: POST /auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await AuthService.login(email, password);

      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        coins: user.coins,
        power_index: user.power_index,
        main_character_id: user.main_character_id,
        is_blocked: user.is_blocked
      };

      req.session.save((err) => {
        if (err) return next(err);

        // Redireciona para o destino original pré-autenticação ou para o painel de papel
        const destination = req.session.returnTo || (user.role === ROLES.ADMIN_SUPREMO ? '/admin' : '/dashboard');
        delete req.session.returnTo;
        return res.redirect(destination);
      });
    } catch (error) {
      if (error.statusCode === 401 || error.statusCode === 400 || error.statusCode === 403) {
        return res.status(error.statusCode).render('auth/login', {
          pageTitle: 'Entrar na Arena — Joker RPG',
          errors: [error.message],
          successMessage: null,
          formData: { email: req.body.email }
        });
      }
      next(error);
    }
  },

  /**
   * Encerra a sessão ativa do usuário e limpa o cookie persistente.
   * Rota: POST /auth/logout
   */
  logout(req, res, next) {
    if (!req.session) {
      return res.redirect('/auth/login');
    }

    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      return res.redirect('/auth/login');
    });
  },

  /**
   * Renderiza a página de solicitação de recuperação de senha.
   * Rota: GET /auth/forgot-password
   */
  showForgotPassword(req, res) {
    res.render('auth/forgot-password', {
      pageTitle: 'Recuperar Senha — Joker RPG',
      errors: [],
      successMessage: null,
      formData: {}
    });
  },

  /**
   * Processa a solicitação de token de redefinição de acesso.
   * Rota: POST /auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      await AuthService.requestPasswordReset(email);

      res.render('auth/forgot-password', {
        pageTitle: 'Recuperar Senha — Joker RPG',
        errors: [],
        successMessage: 'Se o e-mail informado estiver registrado na arena, as instruções de recuperação foram geradas.',
        formData: {}
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Renderiza a tela de definição de nova senha através de token temporário.
   * Rota: GET /auth/reset-password
   */
  showResetPassword(req, res) {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/auth/forgot-password');
    }

    res.render('auth/reset-password', {
      pageTitle: 'Redefinir Senha — Joker RPG',
      token,
      errors: [],
      formData: {}
    });
  },

  /**
   * Processa a atualização da nova senha utilizando o token de uso único.
   * Rota: POST /auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;
      await AuthService.resetPassword(token, password);

      return res.redirect('/auth/login?reset=success');
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).render('auth/reset-password', {
          pageTitle: 'Redefinir Senha — Joker RPG',
          token: req.body.token,
          errors: [error.message],
          formData: {}
        });
      }
      next(error);
    }
  },

  /**
   * Inicia o fluxo de autorização OAuth 2.0 com a Google.
   * Rota: GET /auth/google
   */
  googleAuth(req, res, next) {
    try {
      if (!GoogleAuthService.isConfigured()) {
        return res.redirect('/auth/login?error=oauth_failed');
      }

      // Gera token seguro anti-CSRF
      const state = crypto.randomBytes(16).toString('hex');
      req.session.oauthState = state;

      const url = GoogleAuthService.getAuthUrl(state);
      return res.redirect(url);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Recebe o retorno da Google e conclui o login social.
   * Rota: GET /auth/google/callback
   */
  async googleCallback(req, res, next) {
    try {
      const { code, state, error: googleError } = req.query;

      if (googleError || !code) {
        return res.redirect('/auth/login?error=oauth_failed');
      }

      // Validação estrita do token anti-CSRF state
      if (!req.session.oauthState || req.session.oauthState !== state) {
        delete req.session.oauthState;
        return res.redirect('/auth/login?error=oauth_failed');
      }
      delete req.session.oauthState;

      const profile = await GoogleAuthService.exchangeCodeForProfile(code);
      const user = await GoogleAuthService.findOrCreateUser(profile);

      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        coins: user.coins,
        power_index: user.power_index,
        main_character_id: user.main_character_id,
        is_blocked: user.is_blocked
      };

      req.session.save((err) => {
        if (err) return next(err);
        return res.redirect('/dashboard');
      });
    } catch (error) {
      console.error('[GOOGLE OAUTH CALLBACK ERROR]', error.message);
      return res.redirect('/auth/login?error=oauth_failed');
    }
  }
};

module.exports = AuthController;