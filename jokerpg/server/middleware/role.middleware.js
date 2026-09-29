/**
 * Joker RPG — Middleware de Autorização Baseada em Papéis (RBAC)
 * Garante que rotas administrativas e ações restritas sejam acessadas unicamente por perfis validados no servidor.
 */

const { ROLES } = require('../config/constants');

/**
 * Middleware de autorização estrita para o Administrador Supremo.
 * Bloqueia qualquer tentativa de elevação de privilégio ou acesso não autorizado à área administrativa.
 */
function requireSupremeAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    const isJsonRequest = req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.path.startsWith('/api/');

    if (isJsonRequest) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        error: 'Autenticação necessária para prosseguir.'
      });
    }

    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  if (req.session.user.role !== ROLES.ADMIN_SUPREMO) {
    console.warn(`[SECURITY WARN] Tentativa de acesso não autorizado à rota administrativa: ${req.originalUrl} por usuário: ${req.session.user.username} (ID: ${req.session.user.id})`);

    const isJsonRequest = req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.path.startsWith('/api/');

    if (isJsonRequest) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        error: 'Acesso negado. Privilégios de Administrador Supremo são obrigatórios.'
      });
    }

    return res.status(403).render('errors/403', {
      pageTitle: 'Acesso Negado — 403',
      statusCode: 403,
      message: 'Você não possui autorização para acessar esta área restrita do Joker RPG.',
      user: req.session.user
    });
  }

  next();
}

/**
 * Middleware genérico para validação de múltiplos papéis permitidos.
 * @param {Array<string>} allowedRoles - Lista de papéis autorizados
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/auth/login');
    }

    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).render('errors/403', {
        pageTitle: 'Acesso Negado — 403',
        statusCode: 403,
        message: 'Permissões insuficientes para executar esta operação.',
        user: req.session.user
      });
    }

    next();
  };
}

module.exports = {
  requireSupremeAdmin,
  requireRoles
};