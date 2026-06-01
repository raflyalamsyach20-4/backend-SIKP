import { and, eq } from "drizzle-orm";
import { createDbClient } from "../db";
import { internships, teams, mentorApprovalRequests } from "../db/schema";
import { MentorWorkflowRepository } from "../repositories/mentor-workflow.repository";
import { generateId } from "../utils/helpers";
import { AuthService } from "./auth.service";
import { MahasiswaService } from "./mahasiswa.service";
import { AuthSessionRepository } from "../repositories/auth-session.repository";

export class MentorWorkflowService {
  private workflowRepo: MentorWorkflowRepository;
  private authService: AuthService;
  private mahasiswaService: MahasiswaService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.workflowRepo = new MentorWorkflowRepository(db);
    this.authService = new AuthService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
  }

  private createServiceError(
    message: string,
    code: string,
    statusCode: number,
  ) {
    const error = new Error(message) as Error & {
      code: string;
      statusCode: number;
    };
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  async submitMentorApprovalRequest(
    studentUserId: string,
    data: {
      mentorName: string;
      mentorEmail: string;
      mentorPhone?: string;
      mentorNip?: string;
      companyName?: string;
      position?: string;
      companyAddress?: string;
    },
  ) {
    const id = generateId();
    const request = await this.workflowRepo.createMentorApprovalRequest({
      id,
      studentUserId,
      mentorName: data.mentorName,
      mentorEmail: data.mentorEmail.toLowerCase(),
      mentorPhone: data.mentorPhone ?? null,
      mentorNip: data.mentorNip ?? null,
      companyName: data.companyName ?? null,
      position: data.position ?? null,
      companyAddress: data.companyAddress ?? null,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: studentUserId,
      action: "CREATE_MENTOR_APPROVAL_REQUEST",
      entityType: "mentor_approval_requests",
      entityId: id,
      details: { studentUserId, mentorEmail: data.mentorEmail },
      createdAt: new Date(),
    });

    return request;
  }

  /**
   * Normalize status to lowercase for frontend consistency.
   * Frontend depends on 'pending' | 'approved' | 'rejected' (lowercase).
   */
  private normalizeStatus(status: string): "pending" | "approved" | "rejected" {
    return status.toLowerCase() as "pending" | "approved" | "rejected";
  }

  async listMentorApprovalRequests(
    reviewerUserId: string,
    sessionId: string,
    userRole?: string,
  ) {
    const requests = await this.workflowRepo.listMentorApprovalRequests();
    const authSessionRepo = new AuthSessionRepository(
      createDbClient(this.env.DATABASE_URL),
    );

    // Resolve all possible reviewer IDs (lecturer identity ID vs profile ID)
    const reviewerIds = new Set<string>([reviewerUserId]);
    if (userRole === "dosen") {
      try {
        const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(reviewerUserId);
        if (snapshot) {
          const dsnIdentity = snapshot.identities?.dosen;
          if (dsnIdentity) {
            if (dsnIdentity.id) reviewerIds.add(dsnIdentity.id);
            if (dsnIdentity.profileId) reviewerIds.add(dsnIdentity.profileId);
          }
        }
      } catch (err) {
        console.error(
          "[MentorWorkflowService.listMentorApprovalRequests] Failed to resolve reviewer IDs:",
          err,
        );
      }
    }

    const results = await Promise.all(
      requests.map(async (req: any) => {
        try {
          // Bypass filtering for admins
          if (userRole === "admin" || userRole === "wakil_dekan") {
            // Still need to resolve student info for display
            let studentProfile;
            try {
              studentProfile = await this.mahasiswaService.getMahasiswaById(
                req.studentUserId,
                sessionId,
              );
            } catch {
              studentProfile =
                await authSessionRepo.findProfileSnapshotByMahasiswaId(
                  req.studentUserId,
                );
            }

            const ssoProfile = studentProfile?.profile || studentProfile;
            return {
              ...req,
              status: this.normalizeStatus(req.status),
              studentName:
                ssoProfile?.fullName ||
                ssoProfile?.name ||
                `Mahasiswa (${req.studentUserId})`,
              studentNim:
                studentProfile?.nim ||
                ssoProfile?.identities?.mahasiswa?.nim ||
                "-",
              studentEmail:
                ssoProfile?.emails?.find((e: any) => e.isPrimary)?.email ||
                ssoProfile?.emails?.[0]?.email ||
                "-",
            };
          }

          // 1. Get student profile from SSO
          let studentProfile;
          try {
            studentProfile = await this.mahasiswaService.getMahasiswaById(
              req.studentUserId,
              sessionId,
            );
          } catch {
            // Fallback to local auth_sessions table
            studentProfile =
              await authSessionRepo.findProfileSnapshotByMahasiswaId(
                req.studentUserId,
              );
          }

          if (!studentProfile) return null;

          // 2. Check Authorization (Dosen PA or Dosen Pembimbing)
          const ssoProfile = studentProfile.profile || studentProfile;
          // Look for dosenPA in root studentProfile or profile sub-object
          const dosenPaData = studentProfile.dosenPA || ssoProfile.dosenPA;

          let isAuthorized = false;

          if (dosenPaData) {
            isAuthorized =
              reviewerIds.has(dosenPaData.profileId || "") ||
              reviewerIds.has(dosenPaData.id || "");
            console.warn(
              `[MentorAuth] requestId=${req.id} studentId=${req.studentUserId}` +
              ` | Cek1(SSO dosenPA): profileId=${dosenPaData.profileId} id=${dosenPaData.id} reviewerIds=${Array.from(reviewerIds).join(", ")} => ${isAuthorized}`,
            );
          } else {
            console.warn(
              `[MentorAuth] requestId=${req.id} studentId=${req.studentUserId}` +
              ` | Cek1(SSO dosenPA): dosenPA data NOT FOUND in SSO profile`,
            );
          }

          if (!isAuthorized) {
            const internship =
              await this.workflowRepo.getActiveInternshipByMahasiswaId(
                req.studentUserId,
              );
            console.warn(
              `[MentorAuth] requestId=${req.id} studentId=${req.studentUserId}` +
              ` | Cek2(internship): dosenPembimbingId=${internship?.dosenPembimbingId} dosenPaId=${(internship as any)?.dosenPaId} reviewerIds=${Array.from(reviewerIds).join(", ")} status=${internship?.status}`,
            );
            if (
              internship &&
              (reviewerIds.has(internship.dosenPembimbingId || "") ||
                reviewerIds.has((internship as any).dosenPaId || ""))
            ) {
              isAuthorized = true;
            }
          }

          // Fallback 3: check via team membership (for members who don't yet
          // have an internship record of their own)
          if (!isAuthorized) {
            const team = await this.workflowRepo.getTeamByMahasiswaId(
              req.studentUserId,
            );
            console.warn(
              `[MentorAuth] requestId=${req.id} studentId=${req.studentUserId}` +
              ` | Cek3(team): dosenKpId=${team?.dosenKpId} reviewerIds=${Array.from(reviewerIds).join(", ")} => ${reviewerIds.has(team?.dosenKpId || "")}`,
            );
            if (team && reviewerIds.has(team.dosenKpId || "")) {
              isAuthorized = true;
            }
          }

          console.warn(
            `[MentorAuth] requestId=${req.id} studentId=${req.studentUserId}` +
            ` | FINAL isAuthorized=${isAuthorized}`,
          );

          // If not authorized, filter it out
          if (!isAuthorized) return null;

          // 3. Map to UI structure
          return {
            ...req,
            status: this.normalizeStatus(req.status),
            studentName:
              ssoProfile.fullName ||
              ssoProfile.name ||
              `Mahasiswa (${req.studentUserId})`,
            studentNim:
              studentProfile.nim ||
              ssoProfile.identities?.mahasiswa?.nim ||
              "-",
            studentEmail:
              ssoProfile.emails?.find((e: any) => e.isPrimary)?.email ||
              ssoProfile.emails?.[0]?.email ||
              "-",
          };
        } catch (err) {
          console.error(
            `[MentorWorkflowService.listMentorApprovalRequests] Error processing request ${req.id}:`,
            err,
          );
          return null;
        }
      }),
    );

    // Filter out nulls (unauthorized or error)
    return results.filter((r) => r !== null);
  }

  async getMyMentorRequest(studentUserId: string, sessionId: string) {
    const requests =
      await this.workflowRepo.listMentorApprovalRequestsByStudent(
        studentUserId,
      );
    const authSessionRepo = new AuthSessionRepository(
      createDbClient(this.env.DATABASE_URL),
    );

    return Promise.all(
      requests.map(async (req: any) => {
        try {
          const studentProfile = await this.mahasiswaService.getMahasiswaById(
            req.studentUserId,
            sessionId,
          );
          if (!studentProfile) throw new Error("Not found in SSO");

          return {
            ...req,
            status: this.normalizeStatus(req.status),
            studentName:
              studentProfile?.profile?.fullName ||
              `Mahasiswa (${req.studentUserId})`,
            studentNim: studentProfile?.nim || "-",
            studentEmail:
              studentProfile?.profile?.emails?.find((e) => e.isPrimary)
                ?.email || "-",
          };
        } catch {
          try {
            const snapshot =
              await authSessionRepo.findProfileSnapshotByMahasiswaId(
                req.studentUserId,
              );
            if (snapshot) {
              return {
                ...req,
                status: this.normalizeStatus(req.status),
                studentName:
                  snapshot.fullName ||
                  snapshot.name ||
                  `Mahasiswa (${req.studentUserId})`,
                studentNim: snapshot.identities?.mahasiswa?.nim || "-",
                studentEmail:
                  snapshot.emails?.find((e: any) => e.isPrimary)?.email ||
                  snapshot.emails?.[0]?.email ||
                  "-",
              };
            }
          } catch (err) {}

          return {
            ...req,
            status: this.normalizeStatus(req.status),
            studentName: `Mahasiswa (${req.studentUserId})`,
            studentNim: "-",
            studentEmail: "-",
          };
        }
      }),
    );
  }

  /**
   * Resubmit a rejected mentor approval request.
   * Resets rejectionReason to null so stale rejection messages don't show in the UI.
   */
  async resubmitMentorApprovalRequest(
    requestId: string,
    studentUserId: string,
    data: {
      mentorName: string;
      mentorEmail: string;
      mentorPhone?: string;
      mentorNip?: string;
      companyName?: string;
      position?: string;
      companyAddress?: string;
    },
  ) {
    const existing =
      await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!existing)
      throw this.createServiceError(
        "Request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (existing.studentUserId !== studentUserId)
      throw this.createServiceError("Forbidden", "FORBIDDEN", 403);
    if (existing.status !== "REJECTED")
      throw this.createServiceError(
        "Only rejected requests can be resubmitted",
        "INVALID_STATUS",
        409,
      );

    // Reset rejectionReason to null — this is the key fix from the catatan tim backend
    const updated = await this.workflowRepo.updateMentorApprovalRequest(
      requestId,
      {
        mentorName: data.mentorName,
        mentorEmail: data.mentorEmail.toLowerCase(),
        mentorPhone: data.mentorPhone ?? null,
        mentorNip: data.mentorNip ?? null,
        companyName: data.companyName ?? null,
        position: data.position ?? null,
        companyAddress: data.companyAddress ?? null,
        status: "PENDING",
        rejectionReason: null, // <-- Reset alasan penolakan lama
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      },
    );

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: studentUserId,
      action: "RESUBMIT_MENTOR_APPROVAL_REQUEST",
      entityType: "mentor_approval_requests",
      entityId: requestId,
      details: { mentorEmail: data.mentorEmail },
      createdAt: new Date(),
    });

    return {
      ...updated,
      status: this.normalizeStatus(updated!.status),
    };
  }

  /**
   * Edit a pending mentor approval request (only if status is PENDING)
   */
  async editMentorApprovalRequest(
    requestId: string,
    studentUserId: string,
    data: {
      mentorName: string;
      mentorEmail: string;
      mentorPhone?: string;
      mentorNip?: string;
      companyName?: string;
      position?: string;
      companyAddress?: string;
    },
  ) {
    const existing =
      await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!existing)
      throw this.createServiceError(
        "Request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (existing.studentUserId !== studentUserId)
      throw this.createServiceError("Forbidden", "FORBIDDEN", 403);
    if (existing.status !== "PENDING")
      throw this.createServiceError(
        "Only pending requests can be edited",
        "INVALID_STATUS",
        409,
      );

    const updated = await this.workflowRepo.updateMentorApprovalRequest(
      requestId,
      {
        mentorName: data.mentorName,
        mentorEmail: data.mentorEmail.toLowerCase(),
        mentorPhone: data.mentorPhone ?? null,
        mentorNip: data.mentorNip ?? null,
        companyName: data.companyName ?? null,
        position: data.position ?? null,
        companyAddress: data.companyAddress ?? null,
        updatedAt: new Date(),
      },
    );

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: studentUserId,
      action: "EDIT_MENTOR_APPROVAL_REQUEST",
      entityType: "mentor_approval_requests",
      entityId: requestId,
      details: { mentorEmail: data.mentorEmail },
      createdAt: new Date(),
    });

    return {
      ...updated,
      status: this.normalizeStatus(updated!.status),
    };
  }

  /**
   * Delete/Cancel a pending mentor approval request (only if status is PENDING)
   */
  async deleteMentorApprovalRequest(requestId: string, studentUserId: string) {
    const existing =
      await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!existing)
      throw this.createServiceError(
        "Request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (existing.studentUserId !== studentUserId)
      throw this.createServiceError("Forbidden", "FORBIDDEN", 403);
    if (existing.status !== "PENDING")
      throw this.createServiceError(
        "Only pending requests can be deleted",
        "INVALID_STATUS",
        409,
      );

    // Delete request from database via repository
    await this.workflowRepo.deleteMentorApprovalRequest(requestId);

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: studentUserId,
      action: "DELETE_MENTOR_APPROVAL_REQUEST",
      entityType: "mentor_approval_requests",
      entityId: requestId,
      details: { mentorEmail: existing.mentorEmail },
      createdAt: new Date(),
    });

    return { success: true };
  }

  private async fetchSsoMentorByEmail(email: string, sessionToken: string, name?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const baseUrl = this.env.SSO_BASE_URL;

    // Define search terms to attempt on /api/mentor?search=
    const searchTerms: string[] = [];
    if (name && name.trim()) {
      const cleanName = name.trim();
      const firstWord = cleanName.split(/\s+/)[0];
      if (firstWord) searchTerms.push(firstWord);
      searchTerms.push(cleanName);
    }
    // Final fallback: empty string to fetch all mentors and filter in memory
    searchTerms.push("");

    for (const term of searchTerms) {
      try {
        const url = term 
          ? `${baseUrl}/api/mentor?search=${encodeURIComponent(term)}`
          : `${baseUrl}/api/mentor`;

        console.info(`[MentorWorkflowService.fetchSsoMentorByEmail] Querying SSO: ${url}`);

        // Try session token first
        let response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            Accept: "application/json",
          },
        });

        // Fallback to service token if unauthorized or forbidden
        if (!response.ok && (response.status === 401 || response.status === 403)) {
          console.warn(
            `[MentorWorkflowService.fetchSsoMentorByEmail] Session token rejected (${response.status}) for search, falling back to service token.`
          );
          try {
            const serviceToken = await this.authService.getServiceAccessToken();
            response = await fetch(url, {
              headers: {
                Authorization: `Bearer ${serviceToken}`,
                Accept: "application/json",
              },
            });
          } catch (serviceTokenErr) {
            console.error(
              "[MentorWorkflowService.fetchSsoMentorByEmail] Failed to get service token:",
              serviceTokenErr
            );
          }
        }

        if (response.ok) {
          const payload = (await response.json()) as {
            success: boolean;
            data: any;
          };

          if (payload.success && payload.data) {
            let foundMentor: any = null;
            if (Array.isArray(payload.data)) {
              // Look through all returned mentors and match by primary/profile email
              foundMentor = payload.data.find((m: any) => {
                const emailCandidates = [
                  m?.email,
                  m?.profile?.email,
                  m?.profile?.emails?.[0]?.email,
                  m?.profile?.emails?.find((e: any) => e.isPrimary)?.email,
                  ...(Array.isArray(m?.profile?.emails) 
                    ? m.profile.emails.map((e: any) => e?.email) 
                    : [])
                ].filter((e): e is string => typeof e === "string" && e.trim() !== "");
                
                return emailCandidates.some(e => e.trim().toLowerCase() === normalizedEmail);
              });
            } else {
              const m = payload.data;
              const emailCandidates = [
                m?.email,
                m?.profile?.email,
                m?.profile?.emails?.[0]?.email,
                m?.profile?.emails?.find((e: any) => e.isPrimary)?.email,
                ...(Array.isArray(m?.profile?.emails) 
                  ? m.profile.emails.map((e: any) => e?.email) 
                  : [])
              ].filter((e): e is string => typeof e === "string" && e.trim() !== "");

              if (emailCandidates.some(e => e.trim().toLowerCase() === normalizedEmail)) {
                foundMentor = m;
              }
            }

            if (foundMentor) {
              console.info(
                `[MentorWorkflowService.fetchSsoMentorByEmail] Successfully resolved mentor:`,
                foundMentor.email || foundMentor.profile?.email || foundMentor.id
              );
              return foundMentor;
            }
          }
        } else {
          console.warn(
            `[MentorWorkflowService.fetchSsoMentorByEmail] SSO returned status ${response.status} for search term '${term}'`
          );
        }
      } catch (err) {
        console.warn(
          `[MentorWorkflowService.fetchSsoMentorByEmail] Error during search with term '${term}':`,
          err
        );
      }
    }

    console.info(`[MentorWorkflowService.fetchSsoMentorByEmail] Mentor with email ${normalizedEmail} not found in SSO after all attempts.`);
    return null;
  }

  private async createSsoMentor(
    data: {
      fullName: string;
      instansi: string;
      email: string;
      phoneNumber?: string;
      jabatan?: string;
      bidang?: string;
    },
    token: string,
  ) {
    try {
      // =========================================================================
      // HIT SSO ENDPOINT UNTUK MEMBUAT AKUN MENTOR BARU
      // =========================================================================
      // Di sini SIKP melakukan hit HTTP POST ke Endpoint SSO (`/api/mentor`) untuk:
      // 1. Mendaftarkan identitas Mentor Baru di sistem SSO terintegrasi.
      // 2. Mengirimkan payload berupa nama lengkap (`fullName`), instansi (`instansi`),
      //    email, no. HP (`phoneNumber`), jabatan, dan bidang pekerjaan.
      //    Menggunakan pemetaan terstandarisasi yang bersih (hanya mengirimkan field yang diizinkan
      //    oleh Zod schema strict di backend SSO agar tidak memicu error unrecognized_keys).
      //    Nilai opsional di-fallback ke string kosong `""` atau `"-"` agar properti tetap
      //    ter-serialisasi dalam JSON payload dan tidak melanggar batasan database NOT NULL.
      // 3. Menggunakan otorisasi Bearer token (Token SSO milik pengguna saat ini)
      //    yang akan di-fallback ke Service Token jika token pengguna kadaluarsa/ditolak.
      // =========================================================================
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/mentor`;

      const cleanPayload = {
        fullName: data.fullName,
        instansi: data.instansi || "Instansi Terkait",
        email: data.email,
        phoneNumber: data.phoneNumber || "",
        jabatan: data.jabatan || "",
        bidang: data.bidang || "-",
      };

      let response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cleanPayload),
      });

      if (!response.ok && (response.status === 401 || response.status === 403)) {
        console.warn(
          `[MentorWorkflowService.createSsoMentor] Session token rejected (${response.status}) during creation, falling back to service token.`
        );
        try {
          const serviceToken = await this.authService.getServiceAccessToken();
          response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(cleanPayload),
          });
        } catch (serviceTokenErr) {
          console.error(
            "[MentorWorkflowService.createSsoMentor] Failed to get service token for fallback:",
            serviceTokenErr
          );
        }
      }

      if (!response.ok) {
        const body = await response.text();
        console.error(
          "[MentorWorkflowService.createSsoMentor] SSO Error:",
          body,
        );
        if (response.status === 500 || body.includes("PROFILE_SERVICE_ERROR")) {
          console.warn(
            `[MentorWorkflowService.createSsoMentor] 💡 TIP: 500 PROFILE_SERVICE_ERROR usually indicates that email '${data.email}' is ALREADY registered in another role (e.g. Mahasiswa or Dosen) in the SSO database. Please use a unique, unregistered email for the Field Supervisor.`
          );
        }
        throw new Error(`Failed to create mentor in SSO (${response.status})`);
      }

      const payload = (await response.json()) as {
        success: boolean;
        data: any;
      };
      return payload.data;
    } catch (error) {
      console.error("[MentorWorkflowService.createSsoMentor] Error:", error);
      throw error;
    }
  }

  async approveMentorApprovalRequest(
    requestId: string,
    reviewerUserId: string,
    sessionId: string,
  ) {
    const request =
      await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!request)
      throw this.createServiceError(
        "Mentor approval request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (request.status !== "PENDING")
      throw this.createServiceError(
        "Only pending requests can be approved",
        "INVALID_STATUS",
        409,
      );

    // 1. Verify Dosen PA (Reviewer must be the Dosen PA of the student)
    const studentSso = await this.mahasiswaService.getMahasiswaById(
      request.studentUserId,
      sessionId,
    );
    if (!studentSso) {
      throw this.createServiceError(
        "Mahasiswa tidak ditemukan di sistem SSO maupun cache lokal. Pastikan data mahasiswa valid.",
        "STUDENT_NOT_FOUND",
        404,
      );
    }

    // Resolve all possible reviewer IDs (lecturer identity ID vs profile ID)
    const reviewerIds = new Set<string>([reviewerUserId]);
    try {
      const authSessionRepo = new AuthSessionRepository(
        createDbClient(this.env.DATABASE_URL),
      );
      const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(reviewerUserId);
      if (snapshot) {
        const dsnIdentity = snapshot.identities?.dosen;
        if (dsnIdentity) {
          if (dsnIdentity.id) reviewerIds.add(dsnIdentity.id);
          if (dsnIdentity.profileId) reviewerIds.add(dsnIdentity.profileId);
        }
      }
    } catch (err) {
      console.error(
        "[MentorWorkflowService.approveMentorApprovalRequest] Failed to resolve reviewer IDs:",
        err,
      );
    }

    const isDosenPa =
      reviewerIds.has(studentSso.dosenPA?.profileId || "") ||
      reviewerIds.has(studentSso.dosenPA?.id || "");
    if (!isDosenPa) {
      const internship =
        await this.workflowRepo.getActiveInternshipByMahasiswaId(studentSso.id);
      const internshipAny = internship as any;
      const isDosenPembimbing =
        reviewerIds.has(internship?.dosenPembimbingId || "");
      const isDosenPaById = reviewerIds.has(internshipAny?.dosenPaId || "");
      if (!isDosenPembimbing && !isDosenPaById) {
        throw this.createServiceError(
          "Only the assigned Dosen PA/Pembimbing can approve this request",
          "FORBIDDEN_REVIEWER",
          403,
        );
      }
    }

    const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(
      studentSso.id,
    );
    if (!internship)
      throw this.createServiceError(
        "No active internship found for this student",
        "INTERNSHIP_NOT_FOUND",
        404,
      );

    // 2. Resolve Mentor (Check first, then create if missing)
    const accessToken =
      await this.authService.getSessionAccessTokenOrThrow(sessionId);

    let ssoMentor = await this.fetchSsoMentorByEmail(
      request.mentorEmail,
      accessToken,
      request.mentorName,
    );

    if (!ssoMentor) {
      console.info(
        `[MentorWorkflowService] Mentor ${request.mentorEmail} not found in SSO. Creating new account using lecturer token...`,
      );

      ssoMentor = await this.createSsoMentor(
        {
          fullName: request.mentorName,
          instansi: request.companyName || "Instansi Terkait",
          email: request.mentorEmail,
          phoneNumber: request.mentorPhone || undefined,
          jabatan: request.position || undefined,
          bidang: "-", // Default empty bidang if not provided
        },
        accessToken,
      );
    } else {
      console.info(
        `[MentorWorkflowService] Mentor ${request.mentorEmail} already exists in SSO. Linking existing profile.`,
      );
    }

    const mentorProfileId =
      ssoMentor.profileId || ssoMentor.profile?.id || ssoMentor.id;
    const mentorIdFromSso = ssoMentor.id;

    // Fetch full mentor details from SSO to ensure we have the fullName
    let fullMentorDetails = ssoMentor;
    try {
      const baseUrl = this.env.SSO_BASE_URL;
      const response = await fetch(`${baseUrl}/mentor/${mentorIdFromSso}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          success: boolean;
          data: any;
        };
        if (payload.success && payload.data) {
          fullMentorDetails = payload.data;
        }
      }
    } catch (err) {
      console.warn(
        "[MentorWorkflowService] Failed to fetch full mentor details from SSO:",
        err,
      );
    }

    // 3. Assign the mentor (using their SSO profileId) to the internship
    await this.workflowRepo.assignMentorToInternship(
      internship.id,
      mentorProfileId,
    );

    const updatedRequest = await this.workflowRepo.updateMentorApprovalRequest(
      requestId,
      {
        status: "APPROVED",
        reviewedBy: reviewerUserId,
        reviewedAt: new Date(),
        ssoMentorId: mentorIdFromSso,
        rejectionReason: null,
        mentorName:
          fullMentorDetails.profile?.fullName ||
          fullMentorDetails.fullName ||
          fullMentorDetails.name ||
          fullMentorDetails.nama ||
          request.mentorName,
        mentorPhone:
          fullMentorDetails.profile?.phoneNumber ||
          fullMentorDetails.phoneNumber ||
          fullMentorDetails.phone ||
          request.mentorPhone,
        companyName:
          fullMentorDetails.profile?.instansi ||
          fullMentorDetails.instansi ||
          fullMentorDetails.company ||
          request.companyName,
        position:
          fullMentorDetails.profile?.jabatan ||
          fullMentorDetails.jabatan ||
          request.position,
      },
    );

    console.info(
      `[MentorWorkflowService] Syncing mentor data to DB. SSO Data:`,
      JSON.stringify(fullMentorDetails),
      "Updated Request:",
      updatedRequest?.mentorName,
    );

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: "APPROVE_MENTOR_APPROVAL_REQUEST",
      entityType: "mentor_approval_requests",
      entityId: requestId,
      details: {
        mentorProfileId,
        ssoMentorId: mentorIdFromSso,
        internshipId: internship.id,
        ssoSyncedName: updatedRequest?.mentorName,
      },
      createdAt: new Date(),
    });

    return {
      request: updatedRequest,
      ssoMentorId: mentorIdFromSso,
    };
  }

  async rejectMentorApprovalRequest(
    requestId: string,
    reviewerUserId: string,
    reason: string,
  ) {
    const request =
      await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!request)
      throw this.createServiceError(
        "Mentor approval request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (request.status !== "PENDING")
      throw this.createServiceError(
        "Only pending requests can be rejected",
        "INVALID_STATUS",
        409,
      );

    const updatedRequest = await this.workflowRepo.updateMentorApprovalRequest(
      requestId,
      {
        status: "REJECTED",
        reviewedBy: reviewerUserId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    );

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: "REJECT_MENTOR_APPROVAL_REQUEST",
      entityType: "mentor_approval_requests",
      entityId: requestId,
      details: { reason },
      createdAt: new Date(),
    });

    return updatedRequest;
  }

  async createMentorEmailChangeRequest(
    mentorId: string,
    requestedEmail: string,
    reason?: string,
  ) {
    const req = await this.workflowRepo.createMentorEmailChangeRequest({
      id: generateId(),
      mentorId,
      currentEmail: "",
      requestedEmail: requestedEmail.toLowerCase(),
      reason: reason ?? null,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return req;
  }

  async listMentorEmailChangeRequests() {
    return this.workflowRepo.listMentorEmailChangeRequests();
  }

  async approveMentorEmailChangeRequest(
    requestId: string,
    reviewerUserId: string,
  ) {
    const request =
      await this.workflowRepo.getMentorEmailChangeRequestById(requestId);
    if (!request)
      throw this.createServiceError(
        "Email change request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (request.status !== "PENDING")
      throw this.createServiceError(
        "Only pending requests can be approved",
        "INVALID_STATUS",
        409,
      );

    const updatedRequest =
      await this.workflowRepo.updateMentorEmailChangeRequest(requestId, {
        status: "APPROVED",
      });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: "APPROVE_MENTOR_EMAIL_CHANGE_REQUEST",
      entityType: "mentor_email_change_requests",
      entityId: requestId,
      details: { newEmail: request.requestedEmail },
      createdAt: new Date(),
    });

    // We don't automatically update SSO here yet, as the SSO integration for updating
    // mentor emails might require additional tokens or APIs.
    // Usually this serves as a log or triggers an async sync.

    return updatedRequest;
  }

  async rejectMentorEmailChangeRequest(
    requestId: string,
    reviewerUserId: string,
    reason: string,
  ) {
    const request =
      await this.workflowRepo.getMentorEmailChangeRequestById(requestId);
    if (!request)
      throw this.createServiceError(
        "Email change request not found",
        "REQUEST_NOT_FOUND",
        404,
      );
    if (request.status !== "PENDING")
      throw this.createServiceError(
        "Only pending requests can be rejected",
        "INVALID_STATUS",
        409,
      );

    const updatedRequest =
      await this.workflowRepo.updateMentorEmailChangeRequest(requestId, {
        status: "REJECTED",
        reason: reason,
      });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: "REJECT_MENTOR_EMAIL_CHANGE_REQUEST",
      entityType: "mentor_email_change_requests",
      entityId: requestId,
      details: { reason },
      createdAt: new Date(),
    });

    return updatedRequest;
  }

  async getDosenLogbookMonitor() {
    return this.workflowRepo.listDosenLogbookMonitor();
  }

  async getDosenLogbookMonitorByStudent(studentUserId: string) {
    return this.workflowRepo.listDosenLogbookMonitorByStudent(studentUserId);
  }

  async joinLeaderMentor(studentUserId: string) {
    // 1. Get the student's active internship
    const internship =
      await this.workflowRepo.getActiveInternshipByMahasiswaId(studentUserId);
    if (!internship)
      throw this.createServiceError(
        "No active internship found",
        "INTERNSHIP_NOT_FOUND",
        404,
      );
    if (!internship.teamId)
      throw this.createServiceError(
        "Student is not in a team",
        "NOT_IN_TEAM",
        400,
      );

    // 2. Find the team and leader
    const [team] = await this.workflowRepo.db
      .select()
      .from(teams)
      .where(eq(teams.id, internship.teamId))
      .limit(1);

    if (!team)
      throw this.createServiceError("Team not found", "TEAM_NOT_FOUND", 404);

    // If the student is the leader, they should use the normal approval process
    if (team.leaderMahasiswaId === studentUserId) {
      throw this.createServiceError(
        "As a leader, you must submit your own mentor request",
        "IS_LEADER",
        400,
      );
    }

    // 3. Find the leader's active internship
    const leaderInternship =
      await this.workflowRepo.getActiveInternshipByMahasiswaId(
        team.leaderMahasiswaId,
      );
    if (!leaderInternship)
      throw this.createServiceError(
        "Leader has no active internship",
        "LEADER_INTERNSHIP_NOT_FOUND",
        404,
      );

    // 4. Check if leader has an approved mentor
    if (!leaderInternship.pembimbingLapanganId) {
      throw this.createServiceError(
        "Team leader does not have an approved mentor yet",
        "LEADER_HAS_NO_MENTOR",
        400,
      );
    }

    // 5. Link the student's internship to the leader's mentor
    await this.workflowRepo.assignMentorToInternship(
      internship.id,
      leaderInternship.pembimbingLapanganId,
    );

    // 6. Create a "shadow" approved request for the member so they have metadata and are visible to the mentor
    try {
      // Check if student already has an approved request to avoid duplicates
      const existingRequest = await this.workflowRepo.db
        .select()
        .from(mentorApprovalRequests)
        .where(
          and(
            eq(mentorApprovalRequests.studentUserId, studentUserId),
            eq(mentorApprovalRequests.status, "APPROVED"),
          ),
        )
        .limit(1)
        .then((res: any[]) => res[0]);

      if (existingRequest) {
        console.log(
          `[MentorWorkflowService] Student ${studentUserId} already has an approved mentor request. Skipping shadow creation.`,
        );
      } else {
        const leaderRequest = await this.workflowRepo.db
          .select()
          .from(mentorApprovalRequests)
          .where(
            and(
              eq(
                mentorApprovalRequests.ssoMentorId,
                leaderInternship.pembimbingLapanganId,
              ),
              eq(mentorApprovalRequests.status, "APPROVED"),
            ),
          )
          .limit(1)
          .then((res: any[]) => res[0]);

        if (leaderRequest) {
          await this.workflowRepo.createMentorApprovalRequest({
            id: generateId(),
            studentUserId: studentUserId,
            mentorName: leaderRequest.mentorName,
            mentorEmail: leaderRequest.mentorEmail,
            mentorPhone: leaderRequest.mentorPhone,
            companyName: leaderRequest.companyName,
            position: leaderRequest.position,
            companyAddress: leaderRequest.companyAddress,
            status: "APPROVED",
            ssoMentorId: leaderRequest.ssoMentorId,
            reviewedBy: leaderRequest.reviewedBy,
            reviewedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(
            `[MentorWorkflowService] Created shadow mentor request for student: ${studentUserId} following mentor: ${leaderRequest.mentorName}`,
          );
        }
      }
    } catch (err) {
      console.warn(
        "[MentorWorkflowService] Failed to create shadow mentor request:",
        err,
      );
    }

    return {
      mentorId: leaderInternship.pembimbingLapanganId,
      teamId: internship.teamId,
      leaderId: team.leaderMahasiswaId,
    };
  }
}
