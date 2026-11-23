import { AppError } from '../../shared/errors/app-error.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

function readJsonObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON');
  }

  return body as Record<string, unknown>;
}

function validateCredentials(input: Record<string, unknown>): LoginInput {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';

  if (!email) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El email es obligatorio');
  }

  if (!emailPattern.test(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El email no tiene un formato válido');
  }

  const password = input.password;

  if (typeof password !== 'string' || !password.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La contraseña es obligatoria');
  }

  return { email, password };
}

export function validateLoginInput(body: unknown): LoginInput {
  return validateCredentials(readJsonObject(body));
}

export function validateRegisterInput(body: unknown): RegisterInput {
  const input = readJsonObject(body);
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El nombre es obligatorio');
  }

  return { name, ...validateCredentials(input) };
}
