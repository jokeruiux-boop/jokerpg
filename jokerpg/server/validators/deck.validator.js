/**
 * Joker RPG — Validador de Baralhos (Decks)
 * Valida integridade estrutural, nomenclatura e quantidade regulamentar de cartas por baralho.
 */

const { COMBAT_RULES } = require('../config/constants');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validador para criação ou edição de baralhos.
 */
function validateDeck(req, res, next) {
  const { name, cardIds } = req.body;
  const errors = [];

  // 1. Validação do Nome do Baralho
  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2 || cleanName.length > 50) {
    errors.push('O nome do baralho deve conter entre 2 e 50 caracteres.');
  }

  // 2. Validação da Lista de Cartas
  let cardsArray = cardIds;
  if (typeof cardIds === 'string') {
    try {
      cardsArray = JSON.parse(cardIds);
    } catch (e) {
      cardsArray = cardIds.split(',').map((id) => id.trim());
    }
  }

  if (!Array.isArray(cardsArray)) {
    errors.push('A lista de cartas deve ser fornecida em formato de lista (array).');
  } else {
    if (cardsArray.length < COMBAT_RULES.MIN_DECK_CARDS) {
      errors.push(`O baralho deve conter no mínimo ${COMBAT_RULES.MIN_DECK_CARDS} cartas.`);
    }
    if (cardsArray.length > COMBAT_RULES.MAX_DECK_CARDS) {
      errors.push(`O baralho não pode exceder o limite de ${COMBAT_RULES.MAX_DECK_CARDS} cartas.`);
    }

    const invalidUuid = cardsArray.some((id) => !UUID_REGEX.test(id));
    if (invalidUuid) {
      errors.push('Uma ou mais cartas selecionadas possuem identificadores inválidos.');
    }
  }

  // 3. Retorno de Erros
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
      pageTitle: 'Dados Inválidos do Baralho',
      statusCode: 400,
      message: errors.join(' | '),
      user: req.session ? req.session.user : null
    });
  }

  req.body.name = cleanName;
  req.body.cardIds = cardsArray;
  next();
}

module.exports = {
  validateDeck
};