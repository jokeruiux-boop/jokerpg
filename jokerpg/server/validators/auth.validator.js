/**
 * Joker RPG — Validador de Dados de Autenticação
 * Valida formatos, regras de segurança de senha, consistência e higienização de inputs.
 */

/**
 * Expressão regular para validação de formato de e-mail RFC 5322 simplificado.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Nome de usuário: 3 a 30 caracteres, letras, números e underscores apenas.
 */
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * Validação dos dados de cadastro de nova conta (Register).
 */
function validateRegister(req, res, next) {
  const { username, email, password, confirmPassword } = req.body;
  const errors = [];

  const cleanUsername = (username || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanUsername) {
    errors.push('O nome de usuário é obrigatório.');
  } else if (!USERNAME_REGEX.test(cleanUsername)) {
    errors.push('O nome de usuário deve possuir entre 3 e 30 caracteres e conter apenas letras, números e sublinhados (_).');
  }

  if (!cleanEmail) {
    errors.push('O endereço de e-mail é obrigatório.');
  } else if (!EMAIL_REGEX.test(cleanEmail)) {
    errors.push('O endereço de e-mail fornecido não possui um formato válido.');
  }

  if (!password) {
    errors.push('A senha é obrigatória.');
  } else {
    if (password.length < 8) {
      errors.push('A senha deve conter no mínimo 8 caracteres.');
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.push('A senha deve conter ao menos uma letra e um número.');
    }
  }

  if (password !== confirmPassword) {
    errors.push('A confirmação da senha não coincide com a senha digitada.');
  }

  if (errors.length > 0) {
    return res.status(400).render('auth/register', {
      pageTitle: 'Criar Conta — Joker RPG',
      errors,
      formData: { username: cleanUsername, email: cleanEmail }
    });
  }

  req.body.username = cleanUsername;
  req.body.email = cleanEmail;
  next();
}

/**
 * Validação das credenciais do formulário de login.
 */
function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail) {
    errors.push('O e-mail é obrigatório para acessar sua conta.');
  } else if (!EMAIL_REGEX.test(cleanEmail)) {
    errors.push('Formato de e-mail inválido.');
  }

  if (!password) {
    errors.push('A senha de acesso é obrigatória.');
  }

  if (errors.length > 0) {
    return res.status(400).render('auth/login', {
      pageTitle: 'Entrar na Arena — Joker RPG',
      errors,
      formData: { email: cleanEmail }
    });
  }

  req.body.email = cleanEmail;
  next();
}

/**
 * Validação do pedido de recuperação de senha (Forgot Password).
 */
function validateForgotPassword(req, res, next) {
  const { email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const errors = [];

  if (!cleanEmail) {
    errors.push('Informe o endereço de e-mail cadastrado.');
  } else if (!EMAIL_REGEX.test(cleanEmail)) {
    errors.push('Endereço de e-mail em formato inválido.');
  }

  if (errors.length > 0) {
    return res.status(400).render('auth/forgot-password', {
      pageTitle: 'Recuperação de Acesso — Joker RPG',
      errors,
      formData: { email: cleanEmail }
    });
  }

  req.body.email = cleanEmail;
  next();
}

/**
 * Validação da definição de nova senha através de token.
 */
function validateResetPassword(req, res, next) {
  const { token, password, confirmPassword } = req.body;
  const errors = [];

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    errors.push('Token de recuperação ausente ou corrompido.');
  }

  if (!password) {
    errors.push('A nova senha é obrigatória.');
  } else {
    if (password.length < 8) {
      errors.push('A nova senha deve possuir no mínimo 8 caracteres.');
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.push('A senha deve conter ao menos uma letra e um número.');
    }
  }

  if (password !== confirmPassword) {
    errors.push('As senhas digitadas não coincidem.');
  }

  if (errors.length > 0) {
    return res.status(400).render('auth/reset-password', {
      pageTitle: 'Redefinir Senha — Joker RPG',
      errors,
      token: token || '',
      formData: {}
    });
  }

  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword
};