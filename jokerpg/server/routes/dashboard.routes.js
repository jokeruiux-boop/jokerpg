/**
 * Joker RPG — Rotas do Quartel-General / Dashboard do Jogador
 * Mapeia o acesso protegido à central de comando do combatente.
 */

const express = require('express');
const router = express.Router();

const DashboardController = require('../controllers/dashboard.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Visão geral consolidada do jogador autenticado
router.get('/', requireAuth, DashboardController.index);

module.exports = router;