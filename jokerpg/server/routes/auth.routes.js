/**
 * Joker RPG — Rotas de Autenticação e Ciclo de Sessão
 * Mapeia endpoints públicos e protegidos de registro, login local, OAuth com Google,
 * encerramento de sessão e recuperação de acesso com limitadores de taxa.
 */

const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { redirectIfAuthenticated } = require('../middleware/auth.middleware');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword
} = require('../validators/auth.validator');

// 1. Cadastro de Nova Conta (Registro)
router.get(
  '/register',
  redirectIfAuthenticated,
  AuthController.showRegister
);

router.post(
  '/register',
  redirectIfAuthenticated,
  authLimiter,
  validateRegister,
  AuthController.register
);

// 2. Autenticação Local (Login)
router.get(
  '/login',
  redirectIfAuthenticated,
  AuthController.showLogin
);

router.post(
  '/login',
  redirectIfAuthenticated,
  authLimiter,
  validateLogin,
  AuthController.login
);

// 3. Encerramento de Sessão (Logout)
router.all('/logout', AuthController.logout);

// 4. Recuperação de Acesso e Redefinição de Senha
router.get(
  '/forgot-password',
  redirectIfAuthenticated,
  AuthController.showForgotPassword
);

router.post(
  '/forgot-password',
  redirectIfAuthenticated,
  authLimiter,
  validateForgotPassword,
  AuthController.forgotPassword
);

router.get(
  '/reset-password',
  redirectIfAuthenticated,
  AuthController.showResetPassword
);

router.post(
  '/reset-password',
  redirectIfAuthenticated,
  authLimiter,
  validateResetPassword,
  AuthController.resetPassword
);

// 5. Integração com Google OAuth 2.0
router.get(
  '/google',
  redirectIfAuthenticated,
  AuthController.googleAuth
);

router.get(
  '/google/callback',
  AuthController.googleCallback
);

module.exports = router;