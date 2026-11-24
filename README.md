# Auria Wallet — Backend API

> **API REST modular, segura y de alta precisión para la billetera digital multimoneda Auria Wallet.**  
> Desarrollada en **Node.js**, **Express 5**, **TypeScript** y **PostgreSQL**.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-Passing-6E9F18?logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

---

## 📌 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Estado del Proyecto — Sprint 1](#-estado-del-proyecto--sprint-1)
- [Stack Tecnológico](#-stack-tecnológico)
- [Reglas Transversales del Contrato REST](#-reglas-transversales-del-contrato-rest)
- [Arquitectura de Carpetas](#-arquitectura-de-carpetas)
- [Catálogo de Endpoints de la API](#-catálogo-de-endpoints-de-la-api)
  - [Endpoints del Sprint 1 (Activos)](#endpoints-del-sprint-1-activos)
  - [Endpoints del Sprint 2 (Hoja de Ruta)](#endpoints-del-sprint-2-hoja-de-ruta)
- [Instalación y Configuración Local](#-instalación-y-configuración-local)
- [Scripts Disponibles](#-scripts-disponibles)
- [Estrategia de Trabajo y Git](#-estrategia-de-trabajo-y-git)
- [Equipo de Desarrollo Backend](#-equipo-de-desarrollo-backend)

---

## 📖 Descripción General

**Auria Wallet Backend** es el núcleo de servicios de la plataforma Auria Wallet. Proporciona una arquitectura desacoplada, tipada de extremo a extremo y altamente resiliente que gestiona:
1. **Autenticación sin estado:** Registro seguro y login mediante tokens JWT firmados criptográficamente.
2. **Cuentas Multimoneda:** Creación automática y consulta de saldos para las 3 divisas oficiales: **ARS** (Pesos Argentinos), **USD** (Dólares Estadounidenses) y **EUR** (Euros).
3. **Motor de Cotizaciones en Tiempo Real:** Servicio de tasas de cambio con proveedor primario (**ExchangeRate-API**), degradación elegante a respaldo (**Frankfurter API**) y capa de caché en memoria con TTL para optimizar latencia y consumo de cuotas.
4. **Monitoreo y Diagnóstico:** Health check público sin sobrecarga para orquestadores y supervisores de infraestructura.

---

## 🚀 Estado del Proyecto — Sprint 1

El proyecto ha completado de forma íntegra los objetivos y el checklist de validación del **Sprint 1**:

- [x] **Setup & Tooling:** Configuración moderna con ESM (`"type": "module"`), TypeScript en modo estricto (`NodeNext`), linter/typecheck y pruebas unitarias con Vitest.
- [x] **Base de Datos & Migraciones:** Modelado relacional en PostgreSQL con restricciones de unicidad, claves foráneas en cascada y tipos `NUMERIC(18,2)` para precisión financiera sin pérdida de coma flotante.
- [x] **Módulo de Autenticación:** Registro de usuarios con hashing criptográfico (`scrypt`), prevención de emails duplicados (HTTP `409 Conflict`), login y perfil autenticado (`/api/auth/me`).
- [x] **Módulo de Billeteras:** Creación automática transaccional de billetera con saldos iniciales en `0.00` para `USD`, `EUR` y `ARS`, y endpoint de consulta de saldos (`/api/wallet/balances`).
- [x] **Módulo de Cotizaciones:** Resuelto con validación estricta de divisas, fallback ante caídas externas y caché en memoria con TTL configurable (5 min).
- [x] **Servidor & Middlewares:** Servidor Express montado con `helmet`, `cors`, parseo de JSON, verificación de conexión a PostgreSQL antes de escuchar peticiones y manejo centralizado de errores.

---

## 🛠 Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Entorno de Ejecución** | [Node.js](https://nodejs.org/) (v20+) | Runtime JavaScript del lado del servidor con soporte nativo ESM. |
| **Lenguaje** | [TypeScript](https://www.typescriptlang.org/) (v5+) | Tipado estático estricto, interfaces compartidas y detección temprana de errores. |
| **Framework Web** | [Express](https://expressjs.com/) (v5) | Enrutamiento HTTP, middlewares modulares y control de ciclo de vida de peticiones. |
| **Seguridad Web** | [Helmet](https://helmetjs.github.io/) & [CORS](https://github.com/expressjs/cors) | Cabeceras de seguridad HTTP y control de acceso cruzado restrictivo. |
| **Base de Datos** | [PostgreSQL](https://www.postgresql.org/) & [`pg`](https://node-postgres.com/) | Base de datos relacional transaccional ACID con pool de conexiones gestionado. |
| **Autenticación** | [`jose`](https://github.com/panva/jose) | Generación y verificación de tokens JWT estándar (HS256) seguros y ligeros. |
| **Criptografía** | `node:crypto` (`scrypt`) | Hashing seguro de contraseñas con sal aleatoria criptográfica sin dependencias externas. |
| **Testing** | [Vitest](https://vitest.dev/) | Suite de pruebas unitarias ultrarrápida con soporte ESM y mocks de red y timers. |
| **Herramienta Dev** | [`tsx`](https://github.com/privatenumber/tsx) | Ejecución directa de TypeScript con recarga en caliente (*watch mode*). |

---

## 📐 Reglas Transversales del Contrato REST

Todo cliente o módulo frontend debe cumplir las siguientes convenciones arquitectónicas acordadas:

1. **Autenticación por Cabecera JWT:**  
   Los endpoints privados exigen la cabecera:
   ```http
   Authorization: Bearer <TOKEN_JWT>
   ```
   El backend identifica al usuario **únicamente a través del token**. El cliente nunca debe enviar un `userId` en el cuerpo ni en la URL para operar sobre billeteras.

2. **Montos Monetarios como Cadenas Decimales:**  
   Para evitar los errores clásicos de aproximación en números de coma flotante IEEE 754, todas las cantidades monetarias y tasas de cambio se reciben y devuelven como **strings numéricos** (por ejemplo: `"100.50"`, `"0.920000"`). En PostgreSQL se persisten como `NUMERIC(18, 2)`.

3. **Formato Uniforme de Respuestas de Error:**  
   Todos los errores devuelven un formato consistente con código de dominio identificable:
   ```json
   {
     "error": {
       "code": "INVALID_CREDENTIALS",
       "message": "Credenciales incorrectas"
     }
   }
   ```
   **Códigos HTTP utilizados:**
   - `200 OK`: Operación exitosa.
   - `201 Created`: Recurso creado exitosamente.
   - `400 Bad Request`: Parámetros o cuerpo de petición inválidos.
   - `401 Unauthorized`: Token ausente, expirado o credenciales inválidas.
   - `403 Forbidden`: Acceso no autorizado al recurso solicitado.
   - `404 Not Found`: Recurso no encontrado.
   - `409 Conflict`: Conflicto de estado (ej. email ya registrado).
   - `422 Unprocessable Entity`: Regla de negocio no satisfecha (ej. fondos insuficientes).
   - `429 Too Many Requests`: Límite de tasa de solicitudes excedido.
   - `500 Internal Server Error`: Error no controlado en el servidor.
   - `503 Service Unavailable`: Proveedor externo de cotizaciones no disponible.

---

## 📂 Arquitectura de Carpetas

El proyecto adopta una estructura modular por dominio (*feature-based*), complementada con capas transversales compartidas:

```text
auriawallet-backend/
├── src/
│   ├── config/                     # Configuraciones del sistema
│   │   ├── currencies.ts           # Divisas soportadas (ARS, USD, EUR) y type guards
│   │   ├── database.ts             # Conexión y Pool de PostgreSQL ('pg')
│   │   └── env.ts                  # Variables de entorno tipadas y validadas
│   │
│   ├── database/
│   │   └── migrations/             # Scripts SQL de estructura DDL
│   │       └── 001_create_users_and_wallets.sql
│   │
│   ├── middlewares/                # Middlewares reutilizables de Express
│   │   ├── auth.middleware.ts      # Validación de Bearer JWT y extracción de userId
│   │   └── error.middleware.ts     # Captura centralizada de AppError y formateo de respuesta
│   │
│   ├── modules/                    # Módulos de dominio desacoplados
│   │   ├── auth/                   # Autenticación y Perfil
│   │   │   ├── auth.repository.ts  # Consultas SQL directas a 'users'
│   │   │   ├── auth.routes.ts      # Enrutamiento de /register, /login, /me
│   │   │   ├── auth.schema.ts      # Validación y sanitización de inputs
│   │   │   ├── jwt.ts              # Emisión y verificación de tokens con 'jose'
│   │   │   └── password.ts         # Hashing y verificación con 'scrypt' nativo
│   │   │
│   │   ├── wallets/                # Billeteras y Balances
│   │   │   ├── wallets.repository.ts # Consultas a 'wallets' y 'wallet_balances'
│   │   │   └── wallets.routes.ts   # Enrutador /api/wallet/balances
│   │   │
│   │   ├── exchange-rates/         # Cotizaciones en tiempo real
│   │   │   ├── exchange-rates.cache.ts      # Caché en memoria con TTL
│   │   │   ├── exchange-rates.controller.ts # Controlador de la petición
│   │   │   ├── exchange-rates.provider.ts   # Clientes HTTP (ExchangeRate-API + Frankfurter)
│   │   │   ├── exchange-rates.routes.ts     # Enrutador de cotizaciones
│   │   │   ├── exchange-rates.schema.ts     # Validación de query params (from, to)
│   │   │   └── exchange-rates.service.ts    # Lógica de orquestación y resolución de tasa
│   │   │
│   │   ├── transactions/           # (Sprint 2) Compra, venta, conversión e historial
│   │   └── chat/                   # (Sprint 2) Asistente financiero inteligente (Gemini)
│   │
│   ├── shared/                     # Contratos y utilidades transversales
│   │   ├── errors/                 # Clase AppError tipada con código y status HTTP
│   │   ├── types/                  # Definiciones de tipo e interfaces compartidas
│   │   └── utils/                  # Formateo de decimales y redondeo de precisión
│   │
│   ├── app.ts                      # Configuración de Express, middlewares globales y rutas
│   └── server.ts                   # Bootstrap del servidor, chequeo de DB y escucha de puerto
│
├── tests/                          # Suite de pruebas automatizadas con Vitest
│   └── exchange-rates.test.ts
├── .env.example                    # Plantilla de variables de entorno requeridas
├── package.json
└── tsconfig.json                   # Configuración del compilador TypeScript
```

---

## 📡 Catálogo de Endpoints de la API

### Endpoints del Sprint 1 (Activos)

#### 1. Verificación de Salud del Sistema (Health Check)
* **Método y Ruta:** `GET /health`
* **Acceso:** Público (sin autenticación).
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "status": "ok"
  }
  ```

#### 2. Registro de Usuario y Billetera Inicial
* **Método y Ruta:** `POST /api/auth/register`
* **Acceso:** Público.
* **Cuerpo de la Petición (`Content-Type: application/json`):**
  ```json
  {
    "name": "Juan Perez",
    "email": "juan@example.com",
    "password": "PasswordSegura123!"
  }
  ```
* **Comportamiento:** Hashea la contraseña con `scrypt`, crea de forma atómica el registro en `users`, crea su registro asociado en `wallets` e inicializa sus saldos en `0.00` para `USD`, `EUR` y `ARS` en `wallet_balances`.
* **Respuesta Exitosa (`201 Created`):**
  ```json
  {
    "user": {
      "id": "e8d646b9-43c2-4fcf-8472-8d76cb0db1f8",
      "name": "Juan Perez",
      "email": "juan@example.com",
      "createdAt": "2026-11-23T18:00:00.000Z"
    }
  }
  ```
* **Posibles Errores:**
  * `400 BAD_REQUEST`: Datos faltantes o inválidos.
  * `409 EMAIL_ALREADY_EXISTS`: El email ya se encuentra registrado.

#### 3. Inicio de Sesión (Login)
* **Método y Ruta:** `POST /api/auth/login`
* **Acceso:** Público.
* **Cuerpo de la Petición:**
  ```json
  {
    "email": "juan@example.com",
    "password": "PasswordSegura123!"
  }
  ```
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "user": {
      "id": "e8d646b9-43c2-4fcf-8472-8d76cb0db1f8",
      "name": "Juan Perez",
      "email": "juan@example.com"
    }
  }
  ```
* **Posibles Errores:**
  * `401 INVALID_CREDENTIALS`: Correo o contraseña erróneos.

#### 4. Obtener Perfil del Usuario Autenticado
* **Método y Ruta:** `GET /api/auth/me`
* **Acceso:** Privado (`Authorization: Bearer <JWT>`).
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "id": "e8d646b9-43c2-4fcf-8472-8d76cb0db1f8",
    "name": "Juan Perez",
    "email": "juan@example.com",
    "createdAt": "2026-11-23T18:00:00.000Z"
  }
  ```
* **Posibles Errores:**
  * `401 UNAUTHORIZED`: Token ausente, malformado o expirado.
  * `404 USER_NOT_FOUND`: El usuario referenciado en el token ya no existe.

#### 5. Consultar Saldos de la Billetera Multimoneda
* **Método y Ruta:** `GET /api/wallet/balances`
* **Acceso:** Privado (`Authorization: Bearer <JWT>`).
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "balances": [
      { "currency": "ARS", "amount": "0.00" },
      { "currency": "USD", "amount": "0.00" },
      { "currency": "EUR", "amount": "0.00" }
    ]
  }
  ```

#### 6. Obtener Cotización de Divisas en Tiempo Real
* **Método y Ruta:** `GET /api/exchange-rates?from=USD&to=EUR`
* **Acceso:** Privado (`Authorization: Bearer <JWT>`).
* **Parámetros de Consulta (Query Params):**
  - `from` *(requerido)*: Divisa base (`USD`, `EUR`, `ARS`).
  - `to` *(requerido)*: Divisa cotizada (`USD`, `EUR`, `ARS`).
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "fromCurrency": "USD",
    "toCurrency": "EUR",
    "rate": "0.920000",
    "provider": "ExchangeRate-API",
    "fetchedAt": "2026-11-23T18:05:00.000Z"
  }
  ```
* **Resiliencia & Fallback:**
  - Si `from === to`, responde `rate: "1"` de inmediato.
  - Consulta la caché en memoria (TTL por defecto: 5 minutos).
  - Si vence la caché, consulta **ExchangeRate-API**; ante cualquier error o timeout de 4s, consulta automáticamente **Frankfurter API**.
  - Si ambos fallan, responde `503 RATE_UNAVAILABLE`.

---

### Endpoints del Sprint 2 (Hoja de Ruta)

Los siguientes 5 endpoints completan el catálogo oficial de 11 endpoints en la siguiente iteración:

| N.º | Método | Endpoint | Cabecera Clave | Descripción |
| :---: | :--- | :--- | :--- | :--- |
| **7** | `POST` | `/api/transactions/buy` | `Idempotency-Key: <UUID>` | Compra de divisa extranjera (USD/EUR) debitando saldo en ARS. |
| **8** | `POST` | `/api/transactions/sell` | `Idempotency-Key: <UUID>` | Venta de divisa extranjera (USD/EUR) acreditando saldo en ARS. |
| **9** | `POST` | `/api/transactions/convert` | `Idempotency-Key: <UUID>` | Conversión directa entre divisas (ej. USD a EUR) con recálculo atómico. |
| **10** | `GET` | `/api/transactions` | `Authorization: Bearer` | Historial paginado de movimientos (`limit`, `offset`) ordenado por fecha. |
| **11** | `POST` | `/api/chat` | `Authorization: Bearer` | Asistente financiero inteligente potenciado por Google Gemini con fallback de degradación. |

---

## 💻 Instalación y Configuración Local

### 1. Requisitos Previos
- **Node.js:** Versión `20.x` o superior.
- **npm:** Versión `10.x` o superior.
- **PostgreSQL:** Versión `14.x` o superior en ejecución.

### 2. Clonar el Repositorio
```bash
git clone https://github.com/auriatech-prog/auriawallet-backend.git
cd auriawallet-backend
git checkout develop
```

### 3. Instalar Dependencias
```bash
npm install
```

### 4. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz tomando como base `.env.example`:
```bash
cp .env.example .env
```

Edita `.env` con los valores correspondientes a tu entorno:
```ini
# Configuración del servidor
PORT=3000
NODE_ENV=development

# Seguridad JWT
JWT_SECRET=tu_secreto_super_seguro_y_largo_para_firmar_jwt

# Conexión a PostgreSQL (ejemplo local)
DATABASE_URL=postgres://postgres:password@localhost:5432/auriawallet

# CORS permitido (URL de tu frontend en Vite/React)
CORS_ORIGIN=http://localhost:5173

# Proveedores de cotizaciones
EXCHANGE_RATE_API_URL=https://open.er-api.com/v6/latest
FRANKFURTER_API_URL=https://api.frankfurter.app
EXCHANGE_RATE_CACHE_TTL_MS=300000
```

### 5. Aplicar Migraciones en PostgreSQL
Crea la base de datos si aún no existe y ejecuta el script DDL inicial:
```bash
# Crear base de datos
createdb -U postgres auriawallet

# Ejecutar migración de usuarios, billeteras y saldos
psql -U postgres -d auriawallet -f src/database/migrations/001_create_users_and_wallets.sql
```

### 6. Iniciar el Servidor en Desarrollo
```bash
npm run dev
```
Al iniciar con éxito verás en consola:
```text
Conexión a PostgreSQL verificada
AuriaWallet backend escuchando en el puerto 3000
```

---

## ⚡ Scripts Disponibles

En el archivo `package.json` dispones de los siguientes comandos de desarrollo y construcción:

| Comando | Acción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor con recarga en caliente automática mediante `tsx watch`. |
| `npm run build` | Compila todo el código TypeScript a JavaScript en el directorio `dist/`. |
| `npm run typecheck` | Ejecuta la verificación estricta de tipos de TypeScript sin emitir archivos (`tsc --noEmit`). |
| `npm test` | Ejecuta la suite de pruebas unitarias con Vitest (`vitest run`). |
| `npm start` | Inicia el servidor compilado en producción (`node dist/server.js`). |

---

## 🌿 Estrategia de Trabajo y Git

El equipo aplica el flujo de trabajo colaborativo acordado para evitar colisiones:
- **`main`:** Rama de producción, siempre estable y lista para despliegue.
- **`develop`:** Rama de integración activa donde convergen las características del Sprint.
- **Ramas de Características (`feat/*`):**
  - `feat/backend-setup` & `feat/auth-wallets-db`: Módulos de configuración base, base de datos, auth y wallets.
  - `feat/exchange-rates-module`: Módulo de cotizaciones, proveedores externos, caché y tests.
- **Convención de Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `chore:`, `fix:`, `refactor:`, `test:`).

---

## 👥 Equipo de Desarrollo Backend

Proyecto desarrollado en el marco del Proyecto Final de **Soy Henry** por el equipo de ingeniería backend de **Auria Wallet**:

- **Aldana** — Arquitectura base, persistencia en PostgreSQL, migraciones, autenticación y billeteras.
- **Edison** — Configuración multimoneda, contratos compartidos, módulo de cotizaciones en tiempo real y pruebas unitarias.
