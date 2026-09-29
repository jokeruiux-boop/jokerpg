/**
 * Joker RPG — Rotas Administrativas Supremas
 * Mapeia todos os endpoints restritos ao papel ADMIN_SUPREMO:
 * Moderação de usuários, gerenciamento do catálogo de combatentes e cartas (com uploads BYTEA),
 * controle de missões, telemetria de combates e trilha de auditoria.
 */

const express = require('express');
const router = express.Router();

const AdminController = require('../controllers/admin.controller');
const { requireSupremeAdmin } = require('../middleware/role.middleware');
const { uploadSingle, uploadFields } = require('../middleware/upload.middleware');
const { validateCharacter } = require('../validators/character.validator');
const { validateCard } = require('../validators/card.validator');

// Todas as rotas deste módulo são restritas estritamente ao Administrador Supremo
router.use(requireSupremeAdmin);

// 1. Dashboard e Métricas Gerais
router.get('/', AdminController.dashboard);

// 2. Moderação e Gestão de Jogadores
router.get('/users', AdminController.users);
router.post('/users/:id/toggle-block', AdminController.toggleBlockUser);

// 3. Gerenciamento do Catálogo de Personagens
router.get('/characters', AdminController.characters);

router.post(
  '/characters',
  uploadFields([
    { name: 'image', maxCount: 1 },
    { name: 'avatar', maxCount: 1 }
  ]),
  validateCharacter,
  AdminController.createCharacter
);

router.post(
  '/characters/:id/update',
  uploadFields([
    { name: 'image', maxCount: 1 },
    { name: 'avatar', maxCount: 1 }
  ]),
  validateCharacter,
  AdminController.updateCharacter
);

router.post('/characters/:id/delete', AdminController.deleteCharacter);

// 4. Gerenciamento do Catálogo de Cartas Táticas
router.get('/cards', AdminController.cards);

router.post(
  '/cards',
  uploadSingle('image'),
  validateCard,
  AdminController.createCard
);

router.post(
  '/cards/:id/update',
  uploadSingle('image'),
  validateCard,
  AdminController.updateCard
);

router.post('/cards/:id/delete', AdminController.deleteCard);

// 5. Supervisão e Telemetria de Batalhas
router.get('/battles', AdminController.battles);

// 6. Gerenciamento de Missões
router.get('/missions', AdminController.missions);
router.post('/missions', AdminController.createMission);
router.post('/missions/:id/delete', AdminController.deleteMission);

// 7. Trilha de Auditoria Administrativa (Logs)
router.get('/logs', AdminController.logs);

module.exports = router;