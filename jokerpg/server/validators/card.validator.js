/**
 * Joker RPG — Validador de Criação e Edição de Cartas Táticas
 * Garante a integridade dos parâmetros de combate, custos energéticos, tipos, raridades e efeitos.
 */

const { CARD_TYPES, ELEMENTS, RARITIES } = require('../config/constants');

/**
 * Validador para criação ou atualização de Cartas no catálogo global pelo Administrador Supremo.
 */
function validateCard(req, res, next) {
  const {
    name,
    description,
    type,
    rarity,
    element,
    energy_cost,
    damage,
    defense,
    break_damage,
    effect_code,
    cooldown,
    combo_modifier
  } = req.body;

  const errors = [];

  // 1. Validação de Textos
  const cleanName = (name || '').trim();
  const cleanDescription = (description || '').trim();

  if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
    errors.push('O nome da carta deve ter entre 2 e 100 caracteres.');
  }

  if (!cleanDescription || cleanDescription.length < 5) {
    errors.push('A descrição da carta deve possuir no mínimo 5 caracteres explicativos.');
  }

  // 2. Validação de Enums
  if (!type || !Object.values(CARD_TYPES).includes(type)) {
    errors.push(`Tipo de carta inválido. Permitidos: ${Object.values(CARD_TYPES).join(', ')}.`);
  }

  if (!rarity || !Object.values(RARITIES).includes(rarity)) {
    errors.push(`Raridade de carta inválida. Permitidas: ${Object.values(RARITIES).join(', ')}.`);
  }

  if (!element || !Object.values(ELEMENTS).includes(element)) {
    errors.push(`Elemento inválido. Permitidos: ${Object.values(ELEMENTS).join(', ')}.`);
  }

  // 3. Validação e coerção de Atributos de Combate
  const parsedEnergyCost = parseInt(energy_cost, 10);
  const parsedDamage = parseInt(damage, 10);
  const parsedDefense = parseInt(defense, 10);
  const parsedBreakDamage = parseInt(break_damage, 10);
  const parsedCooldown = parseInt(cooldown, 10) || 0;

  if (isNaN(parsedEnergyCost) || parsedEnergyCost < 0 || parsedEnergyCost > 10) {
    errors.push('O custo de energia deve ser um número inteiro entre 0 e 10.');
  }

  if (isNaN(parsedDamage) || parsedDamage < 0 || parsedDamage > 3000) {
    errors.push('O valor de dano base deve ser um número inteiro entre 0 e 3.000.');
  }

  if (isNaN(parsedDefense) || parsedDefense < 0 || parsedDefense > 3000) {
    errors.push('O valor de defesa base deve ser um número inteiro entre 0 e 3.000.');
  }

  if (isNaN(parsedBreakDamage) || parsedBreakDamage < 0 || parsedBreakDamage > 500) {
    errors.push('O dano de ruptura de postura (Break) deve ser um número inteiro entre 0 e 500.');
  }

  if (isNaN(parsedCooldown) || parsedCooldown < 0 || parsedCooldown > 10) {
    errors.push('O tempo de recarga (cooldown) deve ser um número inteiro entre 0 e 10 rodadas.');
  }

  // 4. Tratamento de Requisitos Adicionais (JSONB)
  let requirementObj = {};
  try {
    requirementObj = typeof req.body.requirement === 'string'
      ? JSON.parse(req.body.requirement || '{}')
      : (req.body.requirement || {});
  } catch (e) {
    errors.push('Formato JSON inválido para os requisitos da carta.');
  }

  // 5. Retorno em caso de inconsistência
  if (errors.length > 0) {
    const isJsonRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJsonRequest) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        errors
      });
    }

    return res.status(400).render('errors/400', {
      pageTitle: 'Dados Inválidos da Carta',
      statusCode: 400,
      message: errors.join(' | '),
      user: req.session ? req.session.user : null
    });
  }

  // Substituição por valores tipados e higienizados
  req.body.name = cleanName;
  req.body.description = cleanDescription;
  req.body.type = type;
  req.body.rarity = rarity;
  req.body.element = element;
  req.body.energy_cost = parsedEnergyCost;
  req.body.damage = parsedDamage;
  req.body.defense = parsedDefense;
  req.body.break_damage = parsedBreakDamage;
  req.body.cooldown = parsedCooldown;
  req.body.effect_code = (effect_code || 'NONE').trim().toUpperCase();
  req.body.combo_modifier = (combo_modifier || 'STANDARD').trim().toUpperCase();
  req.body.requirement = requirementObj;

  next();
}

module.exports = {
  validateCard
};