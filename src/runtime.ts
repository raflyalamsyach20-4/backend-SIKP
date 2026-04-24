import { createDbClient } from '@/db';
import { createAppConfig, type CloudflareBindings } from '@/config';
import { MockR2Bucket } from '@/services';
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
import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';
import { LogbookRepository } from '@/repositories/logbook.repository';
import { MentorRepository } from '@/repositories/mentor.repository';
import { MentorWorkflowRepository } from '@/repositories/mentor-workflow.repository';
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
  LogbookService,
  MentorService,
  MentorWorkflowService,
  InternshipService,
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
  LogbookController,
  MentorController,
  MentorWorkflowController,
  InternshipController,
} from '@/controllers';

const resolveBucket = (config: ReturnType<typeof createAppConfig>) => {
  return config.storage.useMockR2
    ? new MockR2Bucket(config.storage.r2BucketName)
    : config.storage.r2Bucket;
};

export const createRuntime = (env: CloudflareBindings) => {
  const config = createAppConfig(env);
  const dbClient = createDbClient(config.database.url);
  const r2Bucket = resolveBucket(config);

  const userRepository = new UserRepository(dbClient);
  const authSessionRepository = new AuthSessionRepository(dbClient);
  const teamRepository = new TeamRepository(dbClient);
  const submissionRepository = new SubmissionRepository(dbClient);
  const templateRepository = new TemplateRepository(dbClient);
  const responseLetterRepository = new ResponseLetterRepository(dbClient);
  const suratKesediaanRepository = new SuratKesediaanRepository(dbClient);
  const suratPermohonanRepository = new SuratPermohonanRepository(dbClient);
  const mahasiswaRepository = new MahasiswaRepository(dbClient);
  const logbookRepository = new LogbookRepository(dbClient);
  const mentorRepository = new MentorRepository(dbClient);
  const mentorWorkflowRepository = new MentorWorkflowRepository(dbClient);

  const storageService = new StorageService(
    r2Bucket as R2Bucket,
    config.storage.r2Domain,
    config.storage.r2BucketName,
    config.storage.apiBaseUrl
  );
  const authService = new AuthService(authSessionRepository, config);
  const teamResetService = new TeamResetService(submissionRepository, teamRepository);
  const letterService = new LetterService(submissionRepository, storageService);
  const templateService = new TemplateService(
    dbClient,
    { R2Bucket: r2Bucket as R2Bucket, s3Client: undefined },
    config.storage.r2Domain,
    config.storage.r2BucketName
  );
  const responseLetterService = new ResponseLetterService(
    responseLetterRepository,
    submissionRepository,
    storageService,
    teamResetService
  );
  const suratPengantarDosenService = new SuratPengantarDosenService(
    submissionRepository,
    teamRepository,
    userRepository,
    storageService
  );
  const suratKesediaanService = new SuratKesediaanService(
    suratKesediaanRepository,
    teamRepository,
    userRepository,
    storageService
  );
  const suratPermohonanService = new SuratPermohonanService(
    suratPermohonanRepository,
    teamRepository,
    userRepository,
    submissionRepository,
    storageService
  );
  const teamService = new TeamService(
    teamRepository,
    userRepository,
    submissionRepository,
    responseLetterRepository
  );
  const submissionService = new SubmissionService(
    submissionRepository,
    teamRepository,
    suratKesediaanRepository,
    suratPermohonanRepository,
    storageService
  );
  const adminService = new AdminService(
    submissionRepository,
    letterService,
    responseLetterRepository,
    teamRepository,
    userRepository,
    templateRepository
  );
  const dosenService = new DosenService(
    userRepository,
    storageService,
    teamRepository,
    suratKesediaanRepository,
    suratPermohonanRepository,
    suratPengantarDosenService
  );
  const mahasiswaService = new MahasiswaService(
    userRepository,
    storageService,
    teamRepository,
    submissionRepository,
    responseLetterRepository,
    mahasiswaRepository
  );
  const logbookService = new LogbookService(logbookRepository);
  const mentorService = new MentorService(mentorRepository, logbookRepository);
  const mentorWorkflowService = new MentorWorkflowService(mentorWorkflowRepository);
  const internshipService = new InternshipService(mahasiswaRepository);
  const ssoSignatureProxyService = new SsoSignatureProxyService(authService, config);

  return {
    config,
    dbClient,
    storageService,
    authService,
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
    ssoSignatureProxyService,
    authController: new AuthController(authService, userRepository),
    teamController: new TeamController(teamService),
    submissionController: new SubmissionController(submissionService),
    adminController: new AdminController(adminService),
    templateController: new TemplateController(
      dbClient,
      { R2Bucket: r2Bucket as R2Bucket, s3Client: undefined },
      config.storage.r2Domain,
      config.storage.r2BucketName
    ),
    responseLetterController: new ResponseLetterController(responseLetterService),
    dosenController: new DosenController(dosenService),
    mahasiswaController: new MahasiswaController(mahasiswaService),
    suratKesediaanController: new SuratKesediaanController(suratKesediaanService),
    suratPermohonanController: new SuratPermohonanController(suratPermohonanService),
    suratPengantarDosenController: new SuratPengantarDosenController(suratPengantarDosenService),
    ssoSignatureController: new SsoSignatureController(ssoSignatureProxyService),
    logbookController: new LogbookController(logbookService),
    mentorController: new MentorController(mentorService),
    mentorWorkflowController: new MentorWorkflowController(mentorWorkflowService),
    internshipController: new InternshipController(internshipService),
  };
};