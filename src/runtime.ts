import { createDbClient } from '@/db';
import { createAppConfig } from '@/config';
import { MockR2Bucket } from '@/services';
import {
  AuthSessionRepository,
  TeamRepository,
  SubmissionRepository,
  TemplateRepository,
  ResponseLetterRepository,
  SuratKesediaanRepository,
  SuratPermohonanRepository,
} from '@/repositories';
import {
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
} from '@/services';


const resolveBucket = (config: ReturnType<typeof createAppConfig>) => {
  return config.storage.useMockR2
    ? new MockR2Bucket(config.storage.r2BucketName)
    : config.storage.r2Bucket;
};

export const createRuntime = (env: CloudflareBindings) => {
  const config = createAppConfig(env);
  const dbClient = createDbClient(config.database.url);
  
  const authSessionRepository = new AuthSessionRepository(dbClient);
  const teamRepository = new TeamRepository(dbClient);
  const submissionRepository = new SubmissionRepository(dbClient);
  const templateRepository = new TemplateRepository(dbClient);
  const responseLetterRepository = new ResponseLetterRepository(dbClient);
  const suratKesediaanRepository = new SuratKesediaanRepository(dbClient);
  const suratPermohonanRepository = new SuratPermohonanRepository(dbClient);

  const storageService = new StorageService(env);
  const teamResetService = new TeamResetService(env);
  const letterService = new LetterService(env);
  const templateService = new TemplateService(env);
  
  const responseLetterService = new ResponseLetterService(env);
  
  const suratPengantarDosenService = new SuratPengantarDosenService(env);
  const suratKesediaanService = new SuratKesediaanService(env);
  const suratPermohonanService = new SuratPermohonanService(env);

  const teamService = new TeamService(env);
  const submissionService = new SubmissionService(env);
  const adminService = new AdminService(env);
  const dosenService = new DosenService(env);
  const mahasiswaService = new MahasiswaService(env);

  return {
    config,
    dbClient,
    storageService,
    teamResetService,
    letterService,
    templateService,
    responseLetterService,
    suratPengantarDosenService,
    suratKesediaanService,
    suratPermohonanService,
    teamService,
    submissionService,
    adminService,
    dosenService,
    mahasiswaService,
  };
};