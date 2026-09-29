/**
 * Joker RPG — Gerenciador de Pool de Conexões PostgreSQL (Neon Database)
 * Proporciona execução parametrizada de queries e controle transacional ACID.
 */

const { Pool } = require('pg');
const config = require('../server/config/env.config');

const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl,
  max: config.database.maxConnections,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis
});

pool.on('error', (err) => {
  console.error('[DATABASE] Erro inesperado no cliente do pool ocioso:', err.message);
});

/**
 * Executa uma query SQL parametrizada no pool de conexões.
 * @param {string} text - Comando SQL parametrizado ($1, $2, etc.)
 * @param {Array} params - Valores dos parâmetros
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (!config.isProduction && process.env.DEBUG_SQL === 'true') {
      const duration = Date.now() - start;
      console.log('[DATABASE QUERY]', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('[DATABASE ERROR] Falha ao executar query:', {
      text,
      error: error.message
    });
    throw error;
  }
}

/**
 * Executa uma função de negócio dentro de uma transação PostgreSQL atômica.
 * Em caso de erro, realiza ROLLBACK automático. Em sucesso, realiza COMMIT.
 * @param {Function} callback - Função que recebe o client da transação
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DATABASE TRANSACTION ROLLBACK] Operação revertida devido a erro:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Testa a conectividade com o banco de dados Neon no bootstrap da aplicação.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as database');
    console.log(`[DATABASE] Conexão com Neon PostgreSQL estabelecida com sucesso. [DB: ${res.rows[0].database}]`);
    return true;
  } catch (error) {
    console.error('[DATABASE] Falha crítica de conexão com o banco de dados:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  testConnection
};