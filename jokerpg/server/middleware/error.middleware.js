/**
 * Joker RPG — Middleware Central de Tratamento de Erros e 404
 * Trata exceções assíncronas e síncronas, assegurando respostas limpas em JSON ou renderizações EJS.
 * Em produção, omite rastros de execução (stack traces) e segredos do sistema.
 */

const config = require('../config/env.config');

/**
 * Middleware para rotas inexistentes (404 Not Found)
 */
function notFoundHandler(req, res, next) {
  const isApiOrJson = req.xhr || 
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    req.path.startsWith('/battle/action') ||
    req.path.startsWith('/api/');

  if (isApiOrJson) {
    return res.status(404).json({
      success: false,
      statusCode: 404,
      error: 'Recurso ou rota não encontrada no servidor.'
    });
  }

  res.status(404).render('errors/404', {
    pageTitle: 'Página Não Encontrada — 404',
    statusCode: 404,
    message: 'A rota solicitada não existe ou foi movida.',
    user: req.session ? req.session.user : null
  });
}

/**
 * Middleware global de captura e resposta de erros
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const isApiOrJson = req.xhr || 
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    req.path.startsWith('/battle/action') ||
    req.path.startsWith('/api/');

  const errorMessage = (!config.isProduction || statusCode < 500)
    ? (err.message || 'Ocorreu um erro interno no processamento.')
    : 'Ocorreu um erro inesperado nos servidores do Joker RPG.';

  console.error(`[ERROR HANDLER] [${req.method}] ${req.originalUrl} - Status: ${statusCode}`, {
    message: err.message,
    stack: config.isProduction ? undefined : err.stack
  });

  if (isApiOrJson) {
    return res.status(statusCode).json({
      success: false,
      statusCode,
      error: errorMessage,
      ...(config.isProduction ? {} : { stack: err.stack })
    });
  }

  let errorView = 'errors/500';
  if (statusCode === 400) errorView = 'errors/400';
  if (statusCode === 401) errorView = 'errors/401';
  if (statusCode === 403) errorView = 'errors/403';
  if (statusCode === 404) errorView = 'errors/404';

  res.status(statusCode).render(errorView, {
    pageTitle: `Erro ${statusCode} — Joker RPG`,
    statusCode,
    message: errorMessage,
    user: req.session ? req.session.user : null,
    stack: config.isProduction ? null : err.stack
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};