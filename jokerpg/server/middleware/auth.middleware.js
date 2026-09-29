/**
 * Joker RPG — Middleware de Autenticação e Controle de Sessão
 * Assegura que rotas protegidas sejam acessadas apenas por usuários autenticados e não bloqueados.
 */

const { ROLES } = require('../config/constants');

/**
 * Exige que o usuário possua uma sessão ativa válida.
 * Redireciona para o login ou retorna 401 caso seja requisição de API/JSON.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    const isJsonRequest = req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.path.startsWith('/battle/action') ||
      req.path.startsWith('/api/');

    if (isJsonRequest) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        error: 'Sessão expirada ou não autenticada. Faça login novamente.'
      });
    }

    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  if (req.session.user.is_blocked) {
    req.session.destroy(() => {
      res.redirect('/auth/login?error=account_blocked');
    });
    return;
  }

  next();
}

/**
 * Impede que usuários já autenticados acessem rotas públicas de login/registro.
 * Redireciona o usuário para o seu painel correspondente (Admin ou Jogador).
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === ROLES.ADMIN_SUPREMO) {
      return res.redirect('/admin');
    }
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Injeta o objeto do usuário autenticado no contexto global de renderização das Views (res.locals).
 */
function attachUserToLocals(req, res, next) {
  res.locals.currentUser = (req.session && req.session.user) ? req.session.user : null;
  res.locals.isAuthenticated = !!(req.session && req.session.user);
  res.locals.isAdmin = !!(req.session && req.session.user && req.session.user.role === ROLES.ADMIN_SUPREMO);
  next();
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated,
  attachUserToLocals
};