/**
 * Joker RPG — Validador de Ações e Criação de Batalhas Táticas
 * Intercepta e rejeita comandos inconsistentes ou tentativas de injeção de parâmetros proibidos
 * (ex: valores de dano, vitórias forçadas, adulterações de moedas ou XP).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_ACTIONS = Object.freeze([
  'ATTACK',
  'DEFENSE',
  'BLOCK',
  'DODGE',
  'COUNTER',
  'TECHNIQUE',
  'SPECIAL',
  'ULTIMATE',
  'PASS'
]);

// Parâmetros estritamente proibidos enviados pelo cliente que acionam bloqueio de segurança
const FORBIDDEN_CLIENT_FIELDS = Object.freeze([
  'damage',
  'winner',
  'coins',
  'power',
  'xp',
  'level',
  'hp',
  'enemyHp',
  'breakGauge',
  'energy'
]);

/**
 * Validação rigorosa de comandos de ação em combate (HTTP / REST / Sockets)
 */
function validateBattleAction(req, res, next) {
  const { battleId, actionType, cardId } = req.body;
  const errors = [];

  // 1. Verificação contra tentativas de manipulação de dados autoritativos
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (req.body[field] !== undefined) {
      console.warn(`[SECURITY ALERT] Tentativa de adulteração detectada: campo proscrito '${field}' enviado pelo cliente.`);
      return res.status(400).json({
        success: false,
        statusCode: 400,
        error: 'Tentativa de manipulação de parâmetros autoritativos rejeitada pelo servidor.'
      });
    }
  }

  // 2. Validação do Identificador da Partida
  if (!battleId || !UUID_REGEX.test(battleId)) {
    errors.push('Identificador da batalha (battleId) ausente ou inválido.');
  }

  // 3. Validação do Tipo de Ação
  const normalizedAction = (actionType || '').trim().toUpperCase();
  if (!ALLOWED_ACTIONS.includes(normalizedAction)) {
    errors.push(`Tipo de ação tática não reconhecido. Válidos: ${ALLOWED_ACTIONS.join(', ')}.`);
  }

  // 4. Validação de Dependência de Carta
  const actionsRequiringCard = ['ATTACK', 'TECHNIQUE', 'SPECIAL', 'ULTIMATE'];
  if (actionsRequiringCard.includes(normalizedAction)) {
    if (!cardId || !UUID_REGEX.test(cardId)) {
      errors.push(`A ação '${normalizedAction}' requer a seleção de uma carta válida.`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errors
    });
  }

  req.body.actionType = normalizedAction;
  next();
}

/**
 * Validação para inicialização de confrontos (criação de partida de treino PvE ou entrada em fila)
 */
function validateCreateBattle(req, res, next) {
  const { mode, characterId } = req.body;
  const errors = [];

  const allowedModes = ['PVE_TRAINING', 'PVP_CASUAL', 'PVP_RANKED'];
  const normalizedMode = (mode || '').trim().toUpperCase();

  if (!allowedModes.includes(normalizedMode)) {
    errors.push(`Modo de batalha inválido. Permitidos: ${allowedModes.join(', ')}.`);
  }

  if (characterId && !UUID_REGEX.test(characterId)) {
    errors.push('Identificador de personagem inválido.');
  }

  if (errors.length > 0) {
    const isJsonRequest = req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.path.startsWith('/api/');

    if (isJsonRequest) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        errors
      });
    }

    return res.status(400).render('errors/400', {
      pageTitle: 'Erro ao Inicializar Batalha',
      statusCode: 400,
      message: errors.join(' | '),
      user: req.session ? req.session.user : null
    });
  }

  req.body.mode = normalizedMode;
  next();
}

module.exports = {
  validateBattleAction,
  validateCreateBattle
};