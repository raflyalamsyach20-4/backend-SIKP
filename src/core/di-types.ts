import type {
  UserRepository,
  AuthSessionRepository,
  TeamRepository,
  SubmissionRepository,
  TemplateRepository,
  ResponseLetterRepository,
  SuratKesediaanRepository,
  SuratPermohonanRepository,
} from '@/repositories';
import type {
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
import type {
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

export type RepositoryRegistry = {
  userRepository: UserRepository;
  authSessionRepository: AuthSessionRepository;
  teamRepository: TeamRepository;
  submissionRepository: SubmissionRepository;
  templateRepository: TemplateRepository;
  responseLetterRepository: ResponseLetterRepository;
  suratKesediaanRepository: SuratKesediaanRepository;
  suratPermohonanRepository: SuratPermohonanRepository;
};

export type ServiceRegistry = {
  authService: AuthService;
  teamService: TeamService;
  submissionService: SubmissionService;
  adminService: AdminService;
  storageService: StorageService;
  letterService: LetterService;
  templateService: TemplateService;
  responseLetterService: ResponseLetterService;
  teamResetService: TeamResetService;
  dosenService: DosenService;
  mahasiswaService: MahasiswaService;
  suratKesediaanService: SuratKesediaanService;
  suratPermohonanService: SuratPermohonanService;
  suratPengantarDosenService: SuratPengantarDosenService;
  ssoSignatureProxyService: SsoSignatureProxyService;
};

export type ControllerRegistry = {
  authController: AuthController;
  teamController: TeamController;
  submissionController: SubmissionController;
  adminController: AdminController;
  templateController: TemplateController;
  responseLetterController: ResponseLetterController;
  dosenController: DosenController;
  mahasiswaController: MahasiswaController;
  suratKesediaanController: SuratKesediaanController;
  suratPermohonanController: SuratPermohonanController;
  suratPengantarDosenController: SuratPengantarDosenController;
  ssoSignatureController: SsoSignatureController;
};

export type DIContainer = RepositoryRegistry &
  ServiceRegistry &
  ControllerRegistry & {
    reset: () => void;
  };