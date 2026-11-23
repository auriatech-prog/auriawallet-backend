import { AppError } from '../../shared/errors/app-error.js';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export function validateRegisterInput(body: unknown): RegisterInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON');
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El nombre es obligatorio');
  }

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

  return { name, email, password };
}
