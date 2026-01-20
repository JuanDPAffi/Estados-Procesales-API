import { ValidRoles } from '../../modules/auth/schemas/user.schema';

export const PERMISSIONS = {
  
  // Gestión de Importaciones
  INMO_IMPORT: 'inmo:import',

  COMMERCIAL_VIEW_GLOBAL: 'commercial:view_global', // Gerente Comercial
  COMMERCIAL_VIEW_TEAM: 'commercial:view_team',     // Director Comercial
  COMMERCIAL_VIEW_OWN: 'commercial:view_own',       // Gerente de Cuenta

  // Gestión de Usuarios
  USERS_VIEW: 'users:view', // Ver lista de usuarios
  USERS_CREATE: 'users:create', // Crear nuevos usuarios
  USERS_EDIT: 'users:edit', // Editar usuarios existentes
  USERS_ACTIVATE: 'users:activate', // Poder activar/desactivar usuarios

  // Gestión de Inmobiliarias
  INMO_VIEW: 'inmo:view', // Ver lista de inmobiliarias
  INMO_CREATE: 'inmo:create', // Crear nuevas inmobiliarias
  INMO_EDIT: 'inmo:edit', // Editar inmobiliarias existentes
  INMO_ACTIVATE: 'inmo:activate', // Poder activar/desactivar inmobiliarias

  // Gestión de Llamadas
  CALL_CREATE: 'call:create', // Crear llamadas (TICKETS EN HUBSPOT CON API DESDE UN FORMULARIO AQUÍ)

  // Gestión de Procesos
  PROCESOS_VIEW_ALL: 'procesos:view_all', // Esto es para que los Affi puedan consultar todos los procesos o no.
  PROCESOS_VIEW_OWN: 'procesos:view_own', // Esto es para que las inmobiliarias solo puedan ver en su page de Mis Procesos únicamente los procesos de su inmobiliaria como ya se esta haciendo actualmente con scripts.

  // Reportes
  REPORTS_VIEW: 'reports:view', // Ver reportes 

  // Utils
  EXPORT: 'utils:export', // Poder exportar
  
  // Configuración
  SYSTEM_CONFIG: 'system:config', // Acciones del sistema y configuración avanzada
};

export const DEFAULT_ROLE_PERMISSIONS = {
  [ValidRoles.ADMIN]: [], // El Admin no necesita permisos en DB, el Guard le da acceso total.
  
  [ValidRoles.AFFI]: [
    'reports:view',
    'utils:export',
    'procesos:view_all',
  ],

  [ValidRoles.INMOBILIARIA]: [
    'procesos:view_own',
    'utils:export',
  ],

  [ValidRoles.GERENTE_COMERCIAL]: [
    'commercial:view_global',
    'reports:view',
    'utils:export',
  ],

  [ValidRoles.DIRECTOR_COMERCIAL]: [
    'commercial:view_team',
    'reports:view',
    'utils:export',
  ],

  [ValidRoles.GERENTE_CUENTA]: [
    'commercial:view_own',
    'reports:view',
    'utils:export',
  ]
};

export const ALL_PERMISSIONS_LIST = Object.values(PERMISSIONS);