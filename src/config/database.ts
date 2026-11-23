import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Falta configurar DATABASE_URL en el archivo .env');
}

export const pool = new Pool({ connectionString });
