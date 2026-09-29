/**
 * Joker RPG — Orquestrador de Migrações do Banco de Dados
 * Lê e aplica arquivos SQL numerados de forma sequencial, registrando histórico na tabela _migrations.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function createMigrationsTable(client) {
  const queryText = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `;
  await client.query(queryText);
}

async function getExecutedMigrations(client) {
  const { rows } = await client.query('SELECT name FROM _migrations ORDER BY id ASC;');
  return new Set(rows.map(row => row.name));
}

async function runMigrations() {
  console.log('[MIGRATION] Iniciando processo de migrações estruturais...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await createMigrationsTable(client);
    await client.query('COMMIT');

    const executedSet = await getExecutedMigrations(client);
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.warn(`[MIGRATION WARN] Diretório de migrações não encontrado: ${migrationsDir}`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      console.log('[MIGRATION] Nenhum arquivo .sql localizado em database/migrations.');
      return;
    }

    let appliedCount = 0;

    for (const file of files) {
      if (executedSet.has(file)) {
        continue;
      }

      console.log(`[MIGRATION] Aplicando migração: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sqlContent);
        await client.query('INSERT INTO _migrations (name) VALUES ($1);', [file]);
        await client.query('COMMIT');
        console.log(`[MIGRATION] Migração ${file} aplicada com sucesso.`);
        appliedCount++;
      } catch (migrationError) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATION ERROR] Falha ao executar migração ${file}:`, migrationError.message);
        throw migrationError;
      }
    }

    if (appliedCount === 0) {
      console.log('[MIGRATION] Todas as migrações já estão sincronizadas com o banco de dados.');
    } else {
      console.log(`[MIGRATION] Concluído: ${appliedCount} nova(s) migração(ões) aplicada(s) com êxito.`);
    }
  } catch (error) {
    console.error('[MIGRATION FATAL] Execução de migrações abortada:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };