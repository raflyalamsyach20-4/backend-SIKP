import { createDbClient } from '@/db';
import type { AppConfig } from '@/config';
import { MockR2Bucket } from '@/services/mock-r2-bucket';
import { defineLazyRegistry } from './di-factory';
import {
  createControllerFactories,
  createRepositoryFactories,
  createServiceFactories,
} from './di-registries';
import type {
  DIContainer,
  RepositoryRegistry,
  ServiceRegistry,
  ControllerRegistry,
} from './di-types';

export const createDIContainer = (config: AppConfig): DIContainer => {
  const repositoryCache: Partial<RepositoryRegistry> = {};
  const serviceCache: Partial<ServiceRegistry> = {};
  const controllerCache: Partial<ControllerRegistry> = {};
  let dbClient: ReturnType<typeof createDbClient> | undefined;

  const getDbClient = () => {
    if (!dbClient) {
      dbClient = createDbClient(config.database.url);
    }

    return dbClient;
  };
  const getR2Bucket = () =>
    config.storage.useMockR2
      ? new MockR2Bucket(config.storage.r2BucketName)
      : config.storage.r2Bucket;

  const container = {
    reset: () => {
      dbClient = undefined;
      for (const key of Object.keys(repositoryCache) as (keyof RepositoryRegistry)[]) {
        delete repositoryCache[key];
      }
      for (const key of Object.keys(serviceCache) as (keyof ServiceRegistry)[]) {
        delete serviceCache[key];
      }
      for (const key of Object.keys(controllerCache) as (keyof ControllerRegistry)[]) {
        delete controllerCache[key];
      }
    },
  } as DIContainer;

  const ctx = {
    config,
    getDbClient,
    getR2Bucket,
  };

  defineLazyRegistry(container, repositoryCache, createRepositoryFactories(ctx));
  defineLazyRegistry(container, serviceCache, createServiceFactories(ctx));
  defineLazyRegistry(container, controllerCache, createControllerFactories(ctx));

  return container;
};

export type { DIContainer } from './di-types';
