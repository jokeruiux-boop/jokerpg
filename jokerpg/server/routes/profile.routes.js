/**
 * Joker RPG — Rotas de Perfil e Gestão de Conta
 * Mapeia endpoints protegidos de visualização de perfil, atualização de dados,
 * upload de avatar customizado em BYTEA e alteração de senha.
 */

const express = require('express');
const router = express.Router();

const ProfileController = require('../controllers/profile.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

// Todas as rotas de perfil exigem autenticação ativa
router.use(requireAuth);

// Visualização da folha de perfil e estatísticas do combatente
router.get('/', ProfileController.showProfile);

// Atualização de dados permitidos (nome de usuário e personagem principal)
router.post('/update', ProfileController.updateProfile);

// Upload e atualização de avatar dinâmico em BYTEA
router.post('/avatar', uploadSingle('avatar'), ProfileController.updateAvatar);

// Alteração de senha autenticada
router.post('/change-password', ProfileController.changePassword);

module.exports = router;