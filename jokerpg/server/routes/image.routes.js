/**
 * Joker RPG — Rotas de Transmissão de Imagens Dinâmicas em BYTEA
 * Mapeia endpoints públicos de streaming de buffers binários de avatares, personagens e cartas.
 */

const express = require('express');
const router = express.Router();
const ImageController = require('../controllers/image.controller');

// Transmissão do avatar do jogador persistido em BYTEA
router.get('/avatar/:id', ImageController.getAvatar);

// Transmissão da arte principal em alta resolução do personagem
router.get('/character/:id', ImageController.getCharacterImage);

// Transmissão do avatar em miniatura do personagem
router.get('/character-avatar/:id', ImageController.getCharacterAvatar);

// Transmissão da ilustração da carta tática
router.get('/card/:id', ImageController.getCardImage);

module.exports = router;