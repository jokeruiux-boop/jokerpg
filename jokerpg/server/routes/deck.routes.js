/**
 * Joker RPG — Rotas de Baralhos e Montagem Tática (Deck Builder)
 * Mapeia endpoints protegidos para criação, edição, ativação, duplicação
 * e exclusão de baralhos com validação estrita de cartas.
 */

const express = require('express');
const router = express.Router();

const DeckController = require('../controllers/deck.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { validateDeck } = require('../validators/deck.validator');

// Todas as rotas de baralho exigem autenticação ativa
router.use(requireAuth);

// Interface central do Deck Builder (visualização e montador)
router.get('/', DeckController.index);

// Dados do baralho em formato JSON para requisições assíncronas do frontend
router.get('/:id/data', DeckController.getDeckData);

// Criação de um novo baralho com 10 cartas
router.post('/', validateDeck, DeckController.create);

// Atualização de composição de cartas e nome do baralho
router.post('/:id/update', validateDeck, DeckController.update);

// Definição do baralho selecionado como ativo para combates
router.post('/:id/set-active', DeckController.setActive);

// Duplicação de baralho existente
router.post('/:id/duplicate', DeckController.duplicate);

// Remoção lógica do baralho
router.post('/:id/delete', DeckController.delete);

module.exports = router;