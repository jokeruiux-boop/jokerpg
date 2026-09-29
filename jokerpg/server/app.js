/**
 * Joker RPG — Configuração Central da Aplicação Express
 * Configura motor de templates EJS, middlewares de segurança (Helmet com CSP ajustado para desenvolvimento e produção),
 * persistência de sessões no PostgreSQL Neon (connect-pg-simple), rotas e tratamento de erros.
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const config = require('./config/env.config');
const { pool } = require('../database/connection');
const { generalLimiter } = require('./middleware/rateLimit.middleware');
const { attachUserToLocals } = require('./middleware/auth.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const masterRoutes = require('./routes/index.routes');

const app = express();

// 1. Configuração de Cabeçalhos de Segurança (Helmet)
// Ajusta CSP e desativa HSTS / upgradeInsecureRequests no ambiente local para evitar ERR_SSL_PROTOCOL_ERROR
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://accounts.google.com'
        ],
        // Libera eventos inline como onerror="..." e onclick="..."
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'http:',
          'https:',
          'https://lh3.googleusercontent.com'
        ],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https://cdn.jsdelivr.net',
          'https://accounts.google.com'
        ],
        // Impede que o navegador force https:// em localhost
        upgradeInsecureRequests: config.isProduction ? [] : null
      }
    },
    // Desativa HSTS em ambiente local
    hsts: config.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false
  })
);

// 2. Limitador Global de Requisições
app.use(generalLimiter);

// 3. Parsers de Requisições HTTP
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 4. Arquivos Estáticos Públicos
app.use(express.static(path.join(__dirname, '../client/public')));

// 5. Configuração do Motor de Visualização EJS
app.set('views', path.join(__dirname, '../client/views'));
app.set('view engine', 'ejs');

// Confia no proxy reverso do Render para cookies seguros
app.set('trust proxy', 1);

// 6. Gerenciamento Persistente de Sessões (PostgreSQL Neon)
const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: config.session.tableName,
    createTableIfMissing: true
  }),
  name: 'joker_sid',
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.session.cookieMaxAge,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);

// 7. Injeção de Variáveis Globais de Usuário nas Views
app.use(attachUserToLocals);

// 8. Roteador Central
app.use('/', masterRoutes);

// 9. Handlers de Erro e Páginas Não Encontradas (404 / 500)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = {
  app,
  sessionMiddleware
};