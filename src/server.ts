import { once } from 'node:events';
import { app } from './app.js';
import { pool } from './config/database.js';
import { env } from './config/env.js';

try {
  await pool.query('SELECT 1');
  console.log('Conexión a PostgreSQL verificada');

  const server = app.listen(env.port, '0.0.0.0');
  await once(server, 'listening');

  console.log(`AuriaWallet backend escuchando en el puerto ${env.port}`);
} catch {
  console.error('No se pudo iniciar el backend. Revisá PostgreSQL y el puerto configurado.');
  await pool.end();
  process.exitCode = 1;
}