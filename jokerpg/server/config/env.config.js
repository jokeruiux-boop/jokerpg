/**
 * Joker RPG — Validador e Carregador de Configurações de Ambiente
 * Valida a presença e consistência de variáveis críticas no bootstrap do sistema.
 */

const dotenv = require('dotenv');

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const requiredEnvVars = ['DATABASE_URL'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Variável de ambiente obrigatória não definida: ${envVar}`);
    process.exit(1);
  }
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
  console.error('[FATAL] Em ambiente de produção, SESSION_SECRET deve ser fornecida obrigatoriamente.');
  process.exit(1);
}

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: parseInt(process.env.PORT, 10) || 3000,
  appUrl: process.env.APP_URL || (isProduction ? 'https://jokerpg.onrender.com' : 'http://localhost:3000'),

  database: Object.freeze({
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    maxConnections: isProduction ? 20 : 10,
    idleTimeoutMillis: 30000,
    // 30 segundos de tolerância para o Cold Start do Neon Serverless e latência de rede
    connectionTimeoutMillis: 30000
  }),

  session: Object.freeze({
    secret: process.env.SESSION_SECRET || 'joker_rpg_dev_insecure_secret_key_change_me',
    cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    tableName: 'session'
  }),

  googleOAuth: Object.freeze({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || (isProduction
      ? 'https://jokerpg.onrender.com/auth/google/callback'
      : 'http://localhost:3000/auth/google/callback')
  }),

  adminSeed: Object.freeze({
    username: process.env.ADMIN_DEFAULT_USERNAME || 'admin_supremo',
    email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@jokerpg.com',
    password: process.env.ADMIN_DEFAULT_PASSWORD || 'JokerAdmin#2025!Security'
  })
});

module.exports = config;