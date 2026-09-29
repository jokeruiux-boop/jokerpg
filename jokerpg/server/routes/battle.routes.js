/**
 * Joker RPG — Rotas de Batalha e Arena de Combate
 * Mapeia endpoints protegidos para acesso ao lobby de batalha, inicialização de confrontos,
 * execução de ações táticas autoritativas, alternância de turnos e visualização de resultados.
 */

const express = require('express');
const router = express.Router();

const BattleController = require('../controllers/battle.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { battleActionLimiter } = require('../middleware/rateLimit.middleware');
const {
  validateBattleAction,
  validateCreateBattle
} = require('../validators/battle.validator');

// Todas as rotas de combate exigem autenticação ativa
router.use(requireAuth);

// Lobby da Arena de Duelos
router.get('/', BattleController.arena);

// Inicialização de nova partida (PvE Treinamento / Duelo Direto)
router.post('/create', validateCreateBattle, BattleController.create);

// Campo de Batalha (Battle HUD Room)
router.get('/room/:id', BattleController.room);

// Resultado e recompensas pós-combate
router.get('/result/:id', BattleController.result);

// Consulta de estado da partida em tempo real (JSON)
router.get('/:id/state', BattleController.getState);

// Execução de ação tática de combate autoritativa
router.post(
  '/action',
  battleActionLimiter,
  validateBattleAction,
  BattleController.action
);

// Encerramento voluntário de rodada / passagem de turno
router.post(
  '/pass',
  battleActionLimiter,
  BattleController.pass
);

// Desistência voluntária de combate
router.post(
  '/concede',
  BattleController.concede
);

module.exports = router;