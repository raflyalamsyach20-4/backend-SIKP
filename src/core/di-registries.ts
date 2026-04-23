import type { AppConfig } from '@/config';
import type { FactoryMap } from './di-factory';
import type {
  DIContainer,
  RepositoryRegistry,
  ServiceRegistry,
  ControllerRegistry,
} from './di-types';
import {
  UserRepository,
  AuthSessionRepository,
  TeamRepository,
  SubmissionRepository,
  TemplateRepository,
  ResponseLetterRepository,
  SuratKesediaanRepository,
  SuratPermohonanRepository,
} from '@/repositories';
import {
  AuthService,
  TeamService,
  SubmissionService,
  AdminService,
  StorageService,
  LetterService,
  TemplateService,
  ResponseLetterService,
  TeamResetService,
  DosenService,
  MahasiswaService,
  SuratKesediaanService,
  SuratPermohonanService,
  SuratPengantarDosenService,
  SsoSignatureProxyService,
} from '@/services';
import {
  AuthController,
  TeamController,
  SubmissionController,
  AdminController,
  TemplateController,
  ResponseLetterController,
  DosenController,
  MahasiswaController,
  SuratKesediaanController,
  SuratPermohonanController,
  SuratPengantarDosenController,
  SsoSignatureController,
} from '@/controllers';

type DIRegistryContext = {
  config: AppConfig;
  getDbClient: () => ReturnType<typeof import('@/db').createDbClient>;
  getR2Bucket: () => R2Bucket | unknown;
};

export const createRepositoryFactories = (
  ctx: DIRegistryContext
): FactoryMap<DIContainer, RepositoryRegistry> => ({
  userRepository: () => new UserRepository(ctx.getDbClient()),
  authSessionRepository: () => new AuthSessionRepository(ctx.getDbClient()),
  teamRepository: () => new TeamRepository(ctx.getDbClient()),
  submissionRepository: () => new SubmissionRepository(ctx.getDbClient()),
  templateRepository: () => new TemplateRepository(ctx.getDbClient()),
  responseLetterRepository: () => new ResponseLetterRepository(ctx.getDbClient()),
  suratKesediaanRepository: () => new SuratKesediaanRepository(ctx.getDbClient()),
  suratPermohonanRepository: () => new SuratPermohonanRepository(ctx.getDbClient()),
});

export const createServiceFactories = (
  ctx: DIRegistryContext
): FactoryMap<DIContainer, ServiceRegistry> => ({
  authService: (c) => new AuthService(c.authSessionRepository, ctx.config),
  teamService: (c) =>
    new TeamService(
      c.teamRepository,
      c.userRepository,
      c.submissionRepository,
      c.responseLetterRepository
    ),
  submissionService: (c) =>
    new SubmissionService(
      c.submissionRepository,
      c.teamRepository,
      c.suratKesediaanRepository,
      c.suratPermohonanRepository,
      c.storageService
    ),
  adminService: (c) =>
    new AdminService(
      c.submissionRepository,
      c.letterService,
      c.responseLetterRepository,
      c.teamRepository,
      c.userRepository,
      c.templateRepository
    ),
  storageService: () =>
    new StorageService(
      ctx.getR2Bucket() as R2Bucket,
      ctx.config.storage.r2Domain,
      ctx.config.storage.r2BucketName,
      ctx.config.storage.apiBaseUrl
    ),
  letterService: (c) => new LetterService(c.submissionRepository, c.storageService),
  templateService: () =>
    new TemplateService(
      ctx.getDbClient(),
      {
        R2Bucket: ctx.getR2Bucket() as R2Bucket,
        s3Client: undefined,
      },
      ctx.config.storage.r2Domain,
      ctx.config.storage.r2BucketName
    ),
  responseLetterService: (c) =>
    new ResponseLetterService(
      c.responseLetterRepository,
      c.submissionRepository,
      c.storageService,
      c.teamResetService
    ),
  teamResetService: (c) => new TeamResetService(c.submissionRepository, c.teamRepository),
  dosenService: (c) =>
    new DosenService(
      c.userRepository,
      c.storageService,
      c.teamRepository,
      c.suratKesediaanRepository,
      c.suratPermohonanRepository,
      c.suratPengantarDosenService
    ),
  mahasiswaService: (c) =>
    new MahasiswaService(
      c.userRepository,
      c.storageService,
      c.teamRepository,
      c.submissionRepository,
      c.responseLetterRepository
    ),
  suratKesediaanService: (c) =>
    new SuratKesediaanService(
      c.suratKesediaanRepository,
      c.teamRepository,
      c.userRepository,
      c.storageService
    ),
  suratPermohonanService: (c) =>
    new SuratPermohonanService(
      c.suratPermohonanRepository,
      c.teamRepository,
      c.userRepository,
      c.submissionRepository,
      c.storageService
    ),
  suratPengantarDosenService: (c) =>
    new SuratPengantarDosenService(
      c.submissionRepository,
      c.teamRepository,
      c.userRepository,
      c.storageService
    ),
  ssoSignatureProxyService: (c) => new SsoSignatureProxyService(c.authService, ctx.config),
});

export const createControllerFactories = (
  ctx: DIRegistryContext
): FactoryMap<DIContainer, ControllerRegistry> => ({
  authController: (c) => new AuthController(c.authService, c.userRepository),
  teamController: (c) => new TeamController(c.teamService),
  submissionController: (c) => new SubmissionController(c.submissionService),
  adminController: (c) => new AdminController(c.adminService),
  templateController: () =>
    new TemplateController(
      ctx.getDbClient(),
      {
        R2Bucket: ctx.getR2Bucket() as R2Bucket,
        s3Client: undefined,
      },
      ctx.config.storage.r2Domain,
      ctx.config.storage.r2BucketName
    ),
  responseLetterController: (c) => new ResponseLetterController(c.responseLetterService),
  dosenController: (c) => new DosenController(c.dosenService),
  mahasiswaController: (c) => new MahasiswaController(c.mahasiswaService),
  suratKesediaanController: (c) => new SuratKesediaanController(c.suratKesediaanService),
  suratPermohonanController: (c) => new SuratPermohonanController(c.suratPermohonanService),
  suratPengantarDosenController: (c) =>
    new SuratPengantarDosenController(c.suratPengantarDosenService),
  ssoSignatureController: (c) => new SsoSignatureController(c.ssoSignatureProxyService),
});