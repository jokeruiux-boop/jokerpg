/**
 * Joker RPG — Validador de Criação e Edição de Personagens
 * Assegura integridade dos atributos numéricos, enums, limites estatísticos e habilidades.
 */

const { CLASSES, ELEMENTS, RARITIES } = require('../config/constants');

/**
 * Validador para criação ou atualização de Personagens no painel administrativo.
 */
function validateCharacter(req, res, next) {
  const {
    name,
    description,
    rarity,
    element,
    class: characterClass,
    base_hp,
    attack,
    defense,
    speed,
    energy,
    critical_chance
  } = req.body;

  const errors = [];

  // 1. Validação de Textos
  const cleanName = (name || '').trim();
  const cleanDescription = (description || '').trim();

  if (!cleanName || cleanName.length < 2 || cleanName.length > 100) {
    errors.push('O nome do personagem deve possuir entre 2 e 100 caracteres.');
  }

  if (!cleanDescription || cleanDescription.length < 5) {
    errors.push('A descrição do personagem deve conter no mínimo 5 caracteres explicativos.');
  }

  // 2. Validação de Enums
  if (!rarity || !Object.values(RARITIES).includes(rarity)) {
    errors.push(`Raridade inválida. Opções permitidas: ${Object.values(RARITIES).join(', ')}.`);
  }

  if (!element || !Object.values(ELEMENTS).includes(element)) {
    errors.push(`Elemento inválido. Opções permitidas: ${Object.values(ELEMENTS).join(', ')}.`);
  }

  if (!characterClass || !Object.values(CLASSES).includes(characterClass)) {
    errors.push(`Classe inválida. Opções permitidas: ${Object.values(CLASSES).join(', ')}.`);
  }

  // 3. Validação e coerção de Atributos Numéricos
  const parsedHp = parseInt(base_hp, 10);
  const parsedAttack = parseInt(attack, 10);
  const parsedDefense = parseInt(defense, 10);
  const parsedSpeed = parseInt(speed, 10);
  const parsedEnergy = parseInt(energy, 10) || 10;
  const parsedCrit = parseFloat(critical_chance);

  if (isNaN(parsedHp) || parsedHp < 100 || parsedHp > 10000) {
    errors.push('O HP Base deve ser um número inteiro entre 100 e 10.000.');
  }

  if (isNaN(parsedAttack) || parsedAttack < 0 || parsedAttack > 2000) {
    errors.push('O valor de Ataque deve ser um número inteiro entre 0 e 2.000.');
  }

  if (isNaN(parsedDefense) || parsedDefense < 0 || parsedDefense > 2000) {
    errors.push('O valor de Defesa deve ser um número inteiro entre 0 e 2.000.');
  }

  if (isNaN(parsedSpeed) || parsedSpeed < 0 || parsedSpeed > 500) {
    errors.push('A Velocidade (Speed) deve ser um número inteiro entre 0 e 500.');
  }

  if (isNaN(parsedEnergy) || parsedEnergy < 1 || parsedEnergy > 20) {
    errors.push('A reserva de Energia deve ser um valor inteiro entre 1 e 20.');
  }

  if (isNaN(parsedCrit) || parsedCrit < 0 || parsedCrit > 100) {
    errors.push('A Taxa Crítica deve ser um percentual compreendido entre 0.00% e 100.00%.');
  }

  // 4. Tratamento de Habilidades (JSONB)
  let passiveObj = {};
  let activeObj = {};
  let ultimateObj = {};

  try {
    passiveObj = typeof req.body.passive_ability === 'string'
      ? JSON.parse(req.body.passive_ability || '{}')
      : (req.body.passive_ability || {});
  } catch (e) {
    errors.push('Formato JSON inválido para a Habilidade Passiva.');
  }

  try {
    activeObj = typeof req.body.active_ability === 'string'
      ? JSON.parse(req.body.active_ability || '{}')
      : (req.body.active_ability || {});
  } catch (e) {
    errors.push('Formato JSON inválido para a Habilidade Ativa.');
  }

  try {
    ultimateObj = typeof req.body.ultimate_ability === 'string'
      ? JSON.parse(req.body.ultimate_ability || '{}')
      : (req.body.ultimate_ability || {});
  } catch (e) {
    errors.push('Formato JSON inválido para a Habilidade Ultimate.');
  }

  // Retorno em caso de falhas
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
      pageTitle: 'Dados Inválidos do Personagem',
      statusCode: 400,
      message: errors.join(' | '),
      user: req.session ? req.session.user : null
    });
  }

  // Substituição por dados higienizados e tipados no corpo da requisição
  req.body.name = cleanName;
  req.body.description = cleanDescription;
  req.body.rarity = rarity;
  req.body.element = element;
  req.body.class = characterClass;
  req.body.base_hp = parsedHp;
  req.body.attack = parsedAttack;
  req.body.defense = parsedDefense;
  req.body.speed = parsedSpeed;
  req.body.energy = parsedEnergy;
  req.body.critical_chance = parsedCrit;
  req.body.passive_ability = passiveObj;
  req.body.active_ability = activeObj;
  req.body.ultimate_ability = ultimateObj;

  next();
}

module.exports = {
  validateCharacter
};