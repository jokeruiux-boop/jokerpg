/**
 * Joker RPG — Rotas de Classificação e Quadro de Honra
 * Mapeia endpoints protegidos para consulta dos rankings globais,
 * por temporada, poder de combate e taxa de vitórias.
 */

const express = require('express');
const router = express.Router();

const RankingController = require('../controllers/ranking.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Todas as rotas de ranking exigem autenticação ativa
router.use(requireAuth);

// Quadro oficial de classificação de jogadores
router.get('/', RankingController.index);

module.exports = router;