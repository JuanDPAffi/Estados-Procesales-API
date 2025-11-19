# API Redelex - NestJS

Migración del proyecto Node.js + Express a NestJS siguiendo la arquitectura técnica de Affi Latam.

## 🏗️ Arquitectura

El proyecto sigue una **arquitectura modular en capas** basada en plugins:

- **Capa de APIs** (Controllers): Endpoints REST
- **Capa de Servicios** (Services): Lógica de negocio
- **Capa de Datos** (Schemas): Modelos de MongoDB con Mongoose
- **Capa de Integración** (Adapters): Integración con servicios externos (MS Graph, Redelex)

## 📁 Estructura del Proyecto

```
src/
├── config/
│   └── database/
│       └── database.module.ts         # Configuración MongoDB
├── modules/
│   ├── auth/                          # Módulo de Autenticación
│   │   ├── controllers/
│   │   │   └── auth.controller.ts     # Endpoints: register, login, reset
│   │   ├── services/
│   │   │   └── auth.service.ts        # Lógica de negocio
│   │   ├── schemas/
│   │   │   ├── user.schema.ts
│   │   │   └── password-reset-token.schema.ts
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts      # Guard con soporte para SYSTEM_TOKEN
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts        # Estrategia Passport JWT
│   │   ├── dto/
│   │   │   └── auth.dto.ts            # DTOs con validación
│   │   └── auth.module.ts
│   │
│   ├── redelex/                       # Módulo de Redelex
│   │   ├── controllers/
│   │   │   └── redelex.controller.ts  # Endpoints protegidos
│   │   ├── services/
│   │   │   └── redelex.service.ts     # Integración con API Redelex
│   │   ├── schemas/
│   │   │   ├── redelex-token.schema.ts
│   │   │   └── cedula-proceso.schema.ts
│   │   ├── dto/
│   │   │   └── redelex.dto.ts
│   │   └── redelex.module.ts
│   │
│   └── mail/                          # Módulo de Correos
│       ├── services/
│       │   └── mail.service.ts        # Servicio de alto nivel
│       ├── adapters/
│       │   └── ms-graph-mail.adapter.ts  # Patrón Adaptador para MS Graph
│       └── mail.module.ts
│
├── app.module.ts                      # Módulo raíz
└── main.ts                            # Punto de entrada
```

## 🚀 Instalación

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crear archivo `.env` en la raíz:

```env
# Server
PORT=4000

# MongoDB
MONGO_URI=mongodb://localhost:27017/redelex

# JWT
JWT_SECRET=tu_secreto_jwt_super_seguro

# Sistema (Power Automate)
SYSTEM_TASK_TOKEN=token_para_power_automate

# Redelex API
REDELEX_API_KEY=tu_api_key_de_redelex

# Microsoft Graph (Correos)
TENANT_ID_AD=tu_tenant_id
CLIENT_ID_AD=tu_client_id
CLIENT_SECRET_AD=tu_client_secret
GRAPH_SCOPE=https://graph.microsoft.com/.default
MAIL_DEFAULT_FROM=noreply@tudominio.com

# Configuración de correos
MAIL_BRAND_NAME=Estados Procesales
MAIL_LOGO_URL=https://tudominio.com/logo.png
MAIL_FOOTER_TEXT=Affi Latam · Todos los derechos reservados

# Frontend (para enlaces de reset)
FRONT_BASE_URL=http://localhost:4200
```

### 3. Ejecutar en desarrollo

```bash
npm run start:dev
```

La API estará disponible en `http://localhost:4000/api`

### 4. Compilar para producción

```bash
npm run build
npm run start:prod
```

## 📋 Endpoints Disponibles

### Autenticación (`/api/auth`)

- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/request-password-reset` - Solicitar reset de contraseña
- `POST /api/auth/reset-password` - Restablecer contraseña

### Redelex (`/api/redelex`) 🔒 Requiere autenticación

- `GET /api/redelex/proceso/:id` - Detalle de proceso
- `POST /api/redelex/sync-informe/:informeId` - Sincronizar cédula de procesos
- `GET /api/redelex/procesos-por-identificacion/:identificacion` - Buscar por identificación

### Health Check

- `GET /api/health` - Verificar estado de la API (sin autenticación)

## 🔐 Autenticación

La API usa **JWT** (JSON Web Tokens) para autenticación. Después del login o registro, incluye el token en las peticiones:

```
Authorization: Bearer <tu_token_jwt>
```

### Token de Sistema (Power Automate)

Para integraciones con Power Automate, puedes usar el `SYSTEM_TASK_TOKEN`:

```
Authorization: <SYSTEM_TASK_TOKEN>
```

## 🏛️ Patrones de Diseño Implementados

1. **Inyección de Dependencias (DI)**: Todos los servicios usan DI de NestJS
2. **Patrón Repositorio**: Mongoose como ORM
3. **Patrón Adaptador**: `MsGraphMailAdapter` para integración con MS Graph
4. **Guards**: `JwtAuthGuard` para proteger rutas
5. **DTOs con Validación**: `class-validator` para validar payloads
6. **Separación de Capas**: Controllers → Services → Repositories

## 🧪 Validación de DTOs

Los DTOs usan decoradores de `class-validator`:

```typescript
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @MinLength(6)
  password: string;
}
```

## 📦 Dependencias Principales

- **NestJS**: Framework progresivo para Node.js
- **Mongoose**: ODM para MongoDB
- **Passport JWT**: Autenticación con JWT
- **class-validator**: Validación de DTOs
- **bcryptjs**: Hash de contraseñas
- **axios**: Cliente HTTP para APIs externas

## 🔄 Diferencias con Express

| Express                          | NestJS                                              |
| -------------------------------- | --------------------------------------------------- |
| `app.use(middleware)`          | `@UseGuards()`, `@UseInterceptors()`            |
| `router.get('/path', handler)` | `@Get('path')` en controllers                     |
| Funciones con `req, res`       | Decoradores:`@Body()`, `@Param()`, `@Query()` |
| Middleware manual                | Guards, Pipes, Interceptors integrados              |
| `try/catch` manual             | Exception Filters automáticos                      |

## 📝 Notas Importantes

1. **Validación automática**: Los DTOs validan automáticamente los payloads
2. **Exception Filters**: Los errores se formatean automáticamente
3. **Logs estructurados**: Usa el `Logger` de NestJS en lugar de `console.log`
4. **ConfigService**: Accede a variables de entorno de forma tipada
5. **Módulos independientes**: Cada módulo puede evolucionar de forma independiente

## 🚧 Próximos Pasos

- [ ] Agregar Swagger/OpenAPI para documentación automática
- [ ] Implementar rate limiting
- [ ] Agregar tests unitarios e integración
- [ ] Implementar caché con Redis
- [ ] Agregar health checks avanzados
- [ ] Implementar monitoreo con Application Insights (Azure)`<p align="center">`
  `<a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />``</a>`

</p>
