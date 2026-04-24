import { createDbClient } from './index';

export const getMaintenanceDb = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  return createDbClient(databaseUrl);
};

export const getMaintenanceSql = () => {
  return getMaintenanceDb().$client;
};
