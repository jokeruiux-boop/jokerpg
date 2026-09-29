/**
 * Joker RPG — Middleware de Limitação de Taxa de Requisições (Rate Limiting)
 * Mitiga ataques de força bruta, enumeração de contas e flooding em rotas sensíveis.
 */

const rateLimit = require('express-rate-limit');

/**
 * Limitador estrito para rotas de autenticação (Login, Registro, Recuperação de Senha).
 * Permite no máximo 10 requisições por janela de 15 minutos por endereço IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isJson) {
      return res.status(429).json({
        success: false,
        statusCode: 429,
        error: 'Muitas tentativas a partir deste IP. Aguarde 15 minutos antes de tentar novamente.'
      });
    }

    res.status(429).render('errors/400', {
      pageTitle: 'Muitas Tentativas — 429',
      statusCode: 429,
      message: 'Você realizou muitas tentativas de autenticação em um curto intervalo. Por motivos de segurança tática, aguarde 15 minutos.',
      user: null
    });
  }
});

/**
 * Limitador para endpoints de ações táticas em batalha e requisições assíncronas do jogo.
 * Permite até 60 requisições por minuto por IP para evitar spam de scripts maliciosos.
 */
const battleActionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      error: 'Comandos emitidos com rapidez excessiva. Aguarde a validação do turno.'
    });
  }
});

/**
 * Limitador global para requisições gerais à aplicação.
 * Permite até 200 requisições por janela de 15 minutos.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('errors/400', {
      pageTitle: 'Limite de Requisições Atingido',
      statusCode: 429,
      message: 'Taxa máxima de requisições excedida. Aguarde alguns instantes para restabelecer a conexão.',
      user: req.session ? req.session.user : null
    });
  }
});

module.exports = {
  authLimiter,
  battleActionLimiter,
  generalLimiter
};