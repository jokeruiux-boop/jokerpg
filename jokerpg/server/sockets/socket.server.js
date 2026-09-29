/**
 * Joker RPG — Servidor de WebSockets (Socket.IO Gateway)
 * Inicializa a instância do Socket.IO integrada ao servidor HTTP do Node.js,
 * compartilha a sessão do Express de forma segura e registra os gateways de evento.
 */

const { Server } = require('socket.io');
const { registerBattleSocketHandlers } = require('./battle.socket');

let ioInstance = null;

/**
 * Converte um middleware padrão do Express para formato compatível com Socket.IO.
 * Permite que a sessão persistente do usuário (connect-pg-simple) seja lida em socket.request.session.
 * @param {Function} middleware
 * @returns {Function}
 */
const wrapMiddleware = (middleware) => (socket, next) => middleware(socket.request, {}, next);

/**
 * Inicializa o servidor Socket.IO associado ao servidor HTTP.
 * @param {import('http').Server} httpServer
 * @param {Function} sessionMiddleware - Instância de express-session configurada
 * @returns {import('socket.io').Server}
 */
function initSocketServer(httpServer, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 10000,
    transports: ['websocket', 'polling']
  });

  // Vincula a sessão Express ao handshake de cada conexão WebSocket
  if (sessionMiddleware) {
    io.use(wrapMiddleware(sessionMiddleware));
  }

  io.on('connection', (socket) => {
    const session = socket.request.session;
    const user = session ? session.user : null;

    if (user) {
      console.log(`[SOCKET CONNECTED] Usuário: ${user.username} (ID: ${user.id}) conectado no socket ${socket.id}`);
    } else {
      console.log(`[SOCKET CONNECTED] Conexão anônima estabelecida no socket ${socket.id}`);
    }

    // Registra todos os handlers táticos de combate e matchmaking
    registerBattleSocketHandlers(io, socket);

    socket.on('error', (err) => {
      console.error(`[SOCKET ERROR] Erro no socket ${socket.id}:`, err.message);
    });
  });

  ioInstance = io;
  return io;
}

/**
 * Retorna a instância global ativa do servidor Socket.IO.
 * @returns {import('socket.io').Server}
 */
function getIO() {
  if (!ioInstance) {
    throw new Error('Servidor Socket.IO ainda não foi inicializado.');
  }
  return ioInstance;
}

module.exports = {
  initSocketServer,
  getIO
};