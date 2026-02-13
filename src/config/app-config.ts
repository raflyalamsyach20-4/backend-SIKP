/**
 * Application configuration interface
 */
export interface AppConfig {
  database: {
    url: string;
  };
  jwt: {
    secret: string;
  };
  storage: {
    r2Bucket: R2Bucket | any;
    r2Domain: string;
    r2BucketName: string;
    useMockR2: boolean;
  };
}

/**
 * Environment bindings for Cloudflare Workers
 */
export interface CloudflareBindings {
  DATABASE_URL: string;
  JWT_SECRET: string;
  R2_BUCKET: R2Bucket;
  R2_DOMAIN: string;
  R2_BUCKET_NAME: string;
  USE_MOCK_R2?: string | boolean;
}

/**
 * Create application configuration from environment bindings
 */
export const createAppConfig = (env: CloudflareBindings): AppConfig => {
  const useMockR2 = env.USE_MOCK_R2 === true || env.USE_MOCK_R2 === 'true';
  
  return {
    database: {
      url: env.DATABASE_URL,
    },
    jwt: {
      secret: env.JWT_SECRET,
    },
    storage: {
      r2Bucket: env.R2_BUCKET,
      r2Domain: env.R2_DOMAIN,
      r2BucketName: env.R2_BUCKET_NAME,
      useMockR2,
    },
  };
};
