/**
 * Joker RPG — Middleware de Processamento e Validação de Uploads
 * Configura Multer em memória para armazenamento em BYTEA no PostgreSQL,
 * validando estritamente tamanho, MIME types e extensões permitidas.
 */

const multer = require('multer');
const path = require('path');
const { UPLOAD_CONFIG } = require('../config/constants');

// Armazenamento em memória RAM (Buffer) para posterior inserção em BYTEA
const storage = multer.memoryStorage();

/**
 * Validação rigorosa de extensões e tipos MIME
 */
function fileFilter(req, file, cb) {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  const isExtAllowed = allowedExtensions.includes(ext);
  const isMimeAllowed = UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype);

  if (isExtAllowed && isMimeAllowed) {
    return cb(null, true);
  }

  const error = new Error('Formato de imagem inválido. São permitidos apenas arquivos JPEG, PNG e WEBP.');
  error.statusCode = 400;
  cb(error, false);
}

const uploadInstance = multer({
  storage,
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES
  },
  fileFilter
});

/**
 * Middleware para upload de campo de arquivo único com tratamento de exceções do Multer.
 * @param {string} fieldName - Nome do campo no formulário
 */
function uploadSingle(fieldName) {
  const handler = uploadInstance.single(fieldName);

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).render('errors/400', {
            pageTitle: 'Arquivo Muito Grande',
            statusCode: 400,
            message: `O arquivo enviado excede o limite máximo permitido de ${UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
            user: req.session ? req.session.user : null
          });
        }
        return res.status(400).render('errors/400', {
          pageTitle: 'Erro no Upload',
          statusCode: 400,
          message: `Falha no processamento do upload: ${err.message}`,
          user: req.session ? req.session.user : null
        });
      } else if (err) {
        return res.status(400).render('errors/400', {
          pageTitle: 'Arquivo Inválido',
          statusCode: 400,
          message: err.message,
          user: req.session ? req.session.user : null
        });
      }
      next();
    });
  };
}

/**
 * Middleware para upload múltiplo de assets estruturados (ex: imagem principal e avatar de personagens).
 * @param {Array<{name: string, maxCount: number}>} fields - Configuração de campos
 */
function uploadFields(fields) {
  const handler = uploadInstance.fields(fields);

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).render('errors/400', {
            pageTitle: 'Arquivo Muito Grande',
            statusCode: 400,
            message: `Um ou mais arquivos excedem o limite de ${UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
            user: req.session ? req.session.user : null
          });
        }
        return res.status(400).render('errors/400', {
          pageTitle: 'Erro no Upload',
          statusCode: 400,
          message: `Falha no processamento de arquivos: ${err.message}`,
          user: req.session ? req.session.user : null
        });
      } else if (err) {
        return res.status(400).render('errors/400', {
          pageTitle: 'Arquivo Inválido',
          statusCode: 400,
          message: err.message,
          user: req.session ? req.session.user : null
        });
      }
      next();
    });
  };
}

module.exports = {
  uploadSingle,
  uploadFields
};