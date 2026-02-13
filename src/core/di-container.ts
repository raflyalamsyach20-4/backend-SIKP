import { createDbClient } from '@/db';
import { AppConfig } from '@/config';

// Repositories
import { UserRepository } from '@/repositories/user.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TemplateRepository } from '@/repositories/template.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';

// Services
import { AuthService } from '@/services/auth.service';
import { TeamService } from '@/services/team.service';
import { SubmissionService } from '@/services/submission.service';
import { AdminService } from '@/services/admin.service';
import { StorageService } from '@/services/storage.service';
import { LetterService } from '@/services/letter.service';
import { TemplateService } from '@/services/template.service';
import { ResponseLetterService } from '@/services/response-letter.service';
import { MockR2Bucket } from '@/services/mock-r2-bucket';

// Controllers
import { AuthController } from '@/controllers/auth.controller';
import { TeamController } from '@/controllers/team.controller';
import { SubmissionController } from '@/controllers/submission.controller';
import { AdminController } from '@/controllers/admin.controller';
import { TemplateController } from '@/controllers/template.controller';
import { ResponseLetterController } from '@/controllers/response-letter.controller';

/**
 * Dependency Injection Container
 * Manages the lifecycle and dependencies of all services and repositories
 */
export class DIContainer {
  // Repositories
  private _userRepository?: UserRepository;
  private _teamRepository?: TeamRepository;
  private _submissionRepository?: SubmissionRepository;
  private _templateRepository?: TemplateRepository;
  private _responseLetterRepository?: ResponseLetterRepository;

  // Services
  private _authService?: AuthService;
  private _teamService?: TeamService;
  private _submissionService?: SubmissionService;
  private _adminService?: AdminService;
  private _storageService?: StorageService;
  private _letterService?: LetterService;
  private _templateService?: TemplateService;
  private _responseLetterService?: ResponseLetterService;

  // Controllers
  private _authController?: AuthController;
  private _teamController?: TeamController;
  private _submissionController?: SubmissionController;
  private _adminController?: AdminController;
  private _templateController?: TemplateController;
  private _responseLetterController?: ResponseLetterController;

  constructor(private config: AppConfig) {}

  // Database Client
  private get db() {
    return createDbClient(this.config.database.url);
  }

  // Repositories
  get userRepository(): UserRepository {
    if (!this._userRepository) {
      this._userRepository = new UserRepository(this.db);
    }
    return this._userRepository;
  }

  get teamRepository(): TeamRepository {
    if (!this._teamRepository) {
      this._teamRepository = new TeamRepository(this.db);
    }
    return this._teamRepository;
  }

  get submissionRepository(): SubmissionRepository {
    if (!this._submissionRepository) {
      this._submissionRepository = new SubmissionRepository(this.db);
    }
    return this._submissionRepository;
  }

  get templateRepository(): TemplateRepository {
    if (!this._templateRepository) {
      this._templateRepository = new TemplateRepository(this.db);
    }
    return this._templateRepository;
  }

  get responseLetterRepository(): ResponseLetterRepository {
    if (!this._responseLetterRepository) {
      this._responseLetterRepository = new ResponseLetterRepository(this.db);
    }
    return this._responseLetterRepository;
  }

  // Services
  get authService(): AuthService {
    if (!this._authService) {
      this._authService = new AuthService(
        this.userRepository,
        this.config.jwt.secret
      );
    }
    return this._authService;
  }

  get teamService(): TeamService {
    if (!this._teamService) {
      this._teamService = new TeamService(
        this.teamRepository,
        this.userRepository
      );
    }
    return this._teamService;
  }

  get storageService(): StorageService {
    if (!this._storageService) {
      const r2Bucket = this.config.storage.useMockR2
        ? new MockR2Bucket(this.config.storage.r2BucketName)
        : this.config.storage.r2Bucket;

      this._storageService = new StorageService(
        r2Bucket as any,
        this.config.storage.r2Domain,
        this.config.storage.r2BucketName
      );
    }
    return this._storageService;
  }

  get letterService(): LetterService {
    if (!this._letterService) {
      this._letterService = new LetterService(
        this.submissionRepository,
        this.storageService
      );
    }
    return this._letterService;
  }

  get submissionService(): SubmissionService {
    if (!this._submissionService) {
      this._submissionService = new SubmissionService(
        this.submissionRepository,
        this.teamRepository,
        this.storageService
      );
    }
    return this._submissionService;
  }

  get adminService(): AdminService {
    if (!this._adminService) {
      this._adminService = new AdminService(
        this.submissionRepository,
        this.letterService
      );
    }
    return this._adminService;
  }

  get templateService(): TemplateService {
    if (!this._templateService) {
      this._templateService = new TemplateService(
        this.db,
        {
          R2Bucket: this.config.storage.useMockR2
            ? new MockR2Bucket(this.config.storage.r2BucketName)
            : this.config.storage.r2Bucket,
          s3Client: undefined,
        },
        this.config.storage.r2Domain,
        this.config.storage.r2BucketName
      );
    }
    return this._templateService;
  }

  get responseLetterService(): ResponseLetterService {
    if (!this._responseLetterService) {
      this._responseLetterService = new ResponseLetterService(
        this.responseLetterRepository,
        this.submissionRepository,
        this.storageService
      );
    }
    return this._responseLetterService;
  }

  // Controllers
  get authController(): AuthController {
    if (!this._authController) {
      this._authController = new AuthController(
        this.authService,
        this.userRepository
      );
    }
    return this._authController;
  }

  get teamController(): TeamController {
    if (!this._teamController) {
      this._teamController = new TeamController(this.teamService);
    }
    return this._teamController;
  }

  get submissionController(): SubmissionController {
    if (!this._submissionController) {
      this._submissionController = new SubmissionController(
        this.submissionService
      );
    }
    return this._submissionController;
  }

  get adminController(): AdminController {
    if (!this._adminController) {
      this._adminController = new AdminController(this.adminService);
    }
    return this._adminController;
  }

  get templateController(): TemplateController {
    if (!this._templateController) {
      const r2Bucket = this.config.storage.useMockR2
        ? new MockR2Bucket(this.config.storage.r2BucketName)
        : this.config.storage.r2Bucket;

      this._templateController = new TemplateController(
        this.db,
        {
          R2Bucket: r2Bucket as any,
          s3Client: undefined,
        },
        this.config.storage.r2Domain,
        this.config.storage.r2BucketName
      );
    }
    return this._templateController;
  }

  get responseLetterController(): ResponseLetterController {
    if (!this._responseLetterController) {
      this._responseLetterController = new ResponseLetterController(
        this.responseLetterService
      );
    }
    return this._responseLetterController;
  }

  /**
   * Reset all cached instances (useful for testing)
   */
  reset(): void {
    this._userRepository = undefined;
    this._teamRepository = undefined;
    this._submissionRepository = undefined;
    this._templateRepository = undefined;
    this._responseLetterRepository = undefined;
    this._authService = undefined;
    this._teamService = undefined;
    this._submissionService = undefined;
    this._adminService = undefined;
    this._storageService = undefined;
    this._letterService = undefined;
    this._templateService = undefined;
    this._responseLetterService = undefined;
    this._authController = undefined;
    this._teamController = undefined;
    this._submissionController = undefined;
    this._adminController = undefined;
    this._templateController = undefined;
    this._responseLetterController = undefined;
  }
}
