/**
 * Joker RPG — Orquestrador de Sementes de Dados (Seeds)
 * Executa scripts SQL iniciais de forma idempotente e garante a sincronização das credenciais do Administrador Supremo.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./connection');
const config = require('../server/config/env.config');

async function syncSupremeAdmin(client) {
  const { username, email, password } = config.adminSeed;

  const userCheck = await client.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1;',
    [email, username]
  );

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  if (userCheck.rows.length === 0) {
    console.log(`[SEED] Criando Administrador Supremo configurado (${username} / ${email})...`);
    const insertUserRes = await client.query(
      `INSERT INTO users (username, email, role, level, xp, coins, power_index, is_blocked)
       VALUES ($1, $2, 'ADMIN_SUPREMO', 99, 99999, 99999, 9999, FALSE)
       RETURNING id;`,
      [username, email]
    );

    const adminId = insertUserRes.rows[0].id;

    await client.query(
      `INSERT INTO user_auth (user_id, password_hash)
       VALUES ($1, $2);`,
      [adminId, passwordHash]
    );

    await client.query(
      `INSERT INTO admin_logs (admin_id, action_name, target_entity, target_id, ip_address, details)
       VALUES ($1, 'SEED_ADMIN_CONFIGURED', 'users', $2, '127.0.0.1', '{"source": "env.config.js"}'::jsonb);`,
      [adminId, adminId]
    );
  } else {
    const adminId = userCheck.rows[0].id;
    console.log(`[SEED] Administrador Supremo já existe (ID: ${adminId}). Atualizando credencial ativa...`);
    
    await client.query(
      `UPDATE users 
       SET role = 'ADMIN_SUPREMO', is_blocked = FALSE, updated_at = NOW() 
       WHERE id = $1;`,
      [adminId]
    );

    await client.query(
      `INSERT INTO user_auth (user_id, password_hash, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW();`,
      [adminId, passwordHash]
    );
  }
}

async function runSeeds() {
  console.log('[SEED] Iniciando execução de dados base (Seeds)...');
  const client = await pool.connect();

  try {
    const seedsDir = path.join(__dirname, 'seeds');

    if (!fs.existsSync(seedsDir)) {
      console.warn(`[SEED WARN] Diretório de seeds não encontrado: ${seedsDir}`);
      return;
    }

    const files = fs.readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const file of files) {
      console.log(`[SEED] Executando semente: ${file}...`);
      const filePath = path.join(seedsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sqlContent);
        await client.query('COMMIT');
        console.log(`[SEED] Semente ${file} aplicada com sucesso.`);
      } catch (seedError) {
        await client.query('ROLLBACK');
        console.error(`[SEED ERROR] Falha ao executar semente ${file}:`, seedError.message);
        throw seedError;
      }
    }

    // Sincroniza dinamicamente as credenciais com as variáveis de ambiente (.env)
    await client.query('BEGIN');
    await syncSupremeAdmin(client);
    await client.query('COMMIT');

    console.log('[SEED] Processo de sementes concluído com êxito sem perda de integridade.');
  } catch (error) {
    console.error('[SEED FATAL] Execução de seeds abortada:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runSeeds();
}

module.exports = { runSeeds };