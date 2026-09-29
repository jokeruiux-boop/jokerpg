/**
 * Joker RPG — Ponto de Entrada Principal (Bootstrap)
 * Inicializa o servidor HTTP Node.js, integra o gateway de WebSockets (Socket.IO),
 * testa a conectividade persistente com o PostgreSQL Neon e orquestra o encerramento gracioso.
 */

const http = require('http');
const config = require('./server/config/env.config');
const { app, sessionMiddleware } = require('./server/app');
const { initSocketServer } = require('./server/sockets/socket.server');
const { testConnection, pool } = require('./database/connection');

async function bootstrap() {
  try {
    console.log('============================================================');
    console.log('   JOKER RPG — SISTEMA DE BATALHA TÁTICA E CARTAS (WEB)     ');
    console.log('============================================================');
    console.log(`[BOOTSTRAP] Ambiente: ${config.env.toUpperCase()}`);
    console.log(`[BOOTSTRAP] Testando conexão com Neon PostgreSQL...`);

    // 1. Validação da Conexão com o Banco de Dados
    await testConnection();

    // 2. Criação do Servidor HTTP Node.js
    const server = http.createServer(app);

    // 3. Inicialização e Compartilhamento de Sessão com o Servidor Socket.IO
    const io = initSocketServer(server, sessionMiddleware);

    // 4. Inicialização da Escuta de Conexões de Rede
    server.listen(config.port, () => {
      console.log(`[BOOTSTRAP] Servidor ativo e operante na porta: ${config.port}`);
      console.log(`[BOOTSTRAP] URL da Aplicação: ${config.appUrl}`);
      console.log(`[BOOTSTRAP] Gateway Socket.IO habilitado para PvP em tempo real.`);
      console.log('============================================================');
    });

    // 5. Tratamento de Sinais do Sistema Operacional para Encerramento Gracioso (Graceful Shutdown)
    const gracefulShutdown = async (signal) => {
      console.log(`\n[SHUTDOWN] Sinal ${signal} recebido. Encerrando conexões com segurança...`);

      // Interrompe recepção de novos eventos de socket
      io.close(() => {
        console.log('[SHUTDOWN] Servidor Socket.IO desconectado.');
      });

      // Encerra servidor HTTP
      server.close(async () => {
        console.log('[SHUTDOWN] Servidor HTTP Express finalizado.');

        try {
          // Libera o pool de conexões do PostgreSQL
          await pool.end();
          console.log('[SHUTDOWN] Pool de conexões do PostgreSQL drenado.');
          process.exit(0);
        } catch (dbCloseError) {
          console.error('[SHUTDOWN ERROR] Falha ao encerrar pool do banco:', dbCloseError.message);
          process.exit(1);
        }
      });

      // Força encerramento caso trave por mais de 10 segundos
      setTimeout(() => {
        console.error('[SHUTDOWN FATAL] Forçando encerramento por tempo limite.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('[FATAL BOOTSTRAP ERROR] Falha crítica na inicialização da aplicação:', error.message);
    process.exit(1);
  }
}

bootstrap();