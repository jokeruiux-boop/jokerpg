/**
 * Joker RPG — Rotas de Missões e Desafios
 * Mapeia endpoints protegidos para consulta do quadro de missões
 * e resgate de recompensas em XP e moedas de objetivos concluídos.
 */

const express = require('express');
const router = express.Router();

const MissionController = require('../controllers/mission.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Todas as rotas de missões exigem autenticação ativa
router.use(requireAuth);

// Quadro de missões e desafios do combatente
router.get('/', MissionController.index);

// Resgate de recompensas de missão concluída
router.post('/:id/claim', MissionController.claim);

module.exports = router;