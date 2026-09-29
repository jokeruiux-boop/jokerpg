/**
 * Joker RPG — Rotas de Personagens e Combatentes
 * Mapeia endpoints protegidos de exploração do catálogo de heróis,
 * visualização de fichas técnicas, desbloqueio e seleção de combatente principal.
 */

const express = require('express');
const router = express.Router();

const CharacterController = require('../controllers/character.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Todas as rotas de personagens exigem autenticação ativa
router.use(requireAuth);

// Galeria de personagens com filtros elementais, de raridade e busca
router.get('/', CharacterController.list);

// Ficha técnica detalhada de um personagem específico
router.get('/:id', CharacterController.detail);

// Desbloqueio de um combatente para a conta do jogador
router.post('/:id/unlock', CharacterController.unlock);

// Seleção do personagem como o combatente principal equipado
router.post('/:id/select-main', CharacterController.selectMain);

module.exports = router;