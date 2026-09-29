/**
 * Joker RPG — Roteador Central da Aplicação (Master Router)
 * Agrega e distribui todos os módulos de rotas (Autenticação, Quartel-General,
 * Perfil, Personagens, Cartas, Decks, Batalhas, Missões, Rankings, Imagens e Administração).
 */

const express = require('express');
const router = express.Router();

const imageRoutes = require('./image.routes');
const authRoutes = require('./auth.routes');
const dashboardRoutes = require('./dashboard.routes');
const profileRoutes = require('./profile.routes');
const characterRoutes = require('./character.routes');
const cardRoutes = require('./card.routes');
const deckRoutes = require('./deck.routes');
const battleRoutes = require('./battle.routes');
const missionRoutes = require('./mission.routes');
const rankingRoutes = require('./ranking.routes');
const adminRoutes = require('./admin.routes');

const BattleController = require('../controllers/battle.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { ROLES } = require('../config/constants');

// 1. Rota Raiz: Redireciona com base no estado de autenticação e papel
router.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === ROLES.ADMIN_SUPREMO) {
      return res.redirect('/admin');
    }
    return res.redirect('/dashboard');
  }
  return res.redirect('/auth/login');
});

// 2. Transmissão de Imagens Dinâmicas (BYTEA)
router.use('/images', imageRoutes);

// 3. Autenticação e Sessões
router.use('/auth', authRoutes);

// 4. Central do Combatente (Dashboard)
router.use('/dashboard', dashboardRoutes);

// 5. Perfil e Ficha do Jogador
router.use('/profile', profileRoutes);

// 6. Galeria e Fichas de Personagens
router.use('/characters', characterRoutes);

// 7. Arsenal de Cartas Táticas
router.use('/cards', cardRoutes);

// 8. Montador de Baralhos (Deck Builder)
router.use('/decks', deckRoutes);

// 9. Arena e Mecânica de Combate
router.use('/battle', battleRoutes);

// 10. Quadro de Missões e Desafios
router.use('/missions', missionRoutes);

// 11. Quadro Oficial de Classificação (Rankings)
router.use('/ranking', rankingRoutes);

// 12. Histórico de Confrontos
router.get('/history', requireAuth, BattleController.history);

// 13. Módulo Administrativo Supremo
router.use('/admin', adminRoutes);

module.exports = router;