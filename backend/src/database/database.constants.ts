export const EXPECTED_DATABASE_NAME = 'movana';
export const EXPECTED_DATABASE_USER = 'movana_app';
export const FORBIDDEN_DATABASE_USERS = new Set([
  'postgres',
  'movana_owner',
  'movana_migration',
  'maritime_user',
]);
