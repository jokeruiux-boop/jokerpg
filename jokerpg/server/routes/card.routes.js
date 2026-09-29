/**
 * Joker RPG — Rotas de Cartas Táticas e Inventário
 * Mapeia endpoints protegidos para consulta da coleção de cartas,
 * filtros por raridade/elemento e detalhes técnicos de cartas individuais.
 */

const express = require('express');
const router = express.Router();

const CardController = require('../controllers/card.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Todas as rotas de cartas exigem autenticação ativa
router.use(requireAuth);

// Visualização da galeria de cartas e inventário do combatente
router.get('/', CardController.index);

// Detalhes técnicos de uma carta em formato JSON (para modais e inspeções no frontend)
router.get('/:id/details', CardController.getCardDetails);

module.exports = router;