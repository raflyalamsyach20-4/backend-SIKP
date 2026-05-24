import { createDbClient } from "@/db";
import { MahasiswaRepository } from "@/repositories/mahasiswa.repository";
import { MentorRepository } from "@/repositories/mentor.repository";
import { MentorWorkflowRepository } from "@/repositories/mentor-workflow.repository";
import { MahasiswaService } from "./mahasiswa.service";
import { DosenService } from "./dosen.service";
import { StorageService } from "./storage.service";
import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { SsoSignatureProxyService } from "./sso-signature-proxy.service";
import { authSessions, teams, mentorApprovalRequests, internships } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";

export class InternshipService {
  private mahasiswaRepo: MahasiswaRepository;
  private mentorRepo: MentorRepository;
  private workflowRepo: MentorWorkflowRepository;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private storageService: StorageService;
  private authSessionRepo: AuthSessionRepository;
  private ssoSignatureProxyService: SsoSignatureProxyService;
  private db: any;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mahasiswaRepo = new MahasiswaRepository(this.db);
    this.mentorRepo = new MentorRepository(this.db);
    this.workflowRepo = new MentorWorkflowRepository(this.db);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.storageService = new StorageService(this.env);
    this.authSessionRepo = new AuthSessionRepository(this.db);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
  }

  private async resolveMentorSignature(mentorId: string, internshipId?: string) {
    // 1. Coba ambil dari cache database lokal terlebih dahulu!
    if (internshipId) {
      try {
        const [cachedInternship] = await this.db
          .select({
            base64: internships.mentorSignatureBase64,
            mimeType: internships.mentorSignatureMimeType,
          })
          .from(internships)
          .where(eq(internships.id, internshipId))
          .limit(1);

        if (cachedInternship?.base64) {
          const rawBase64 = cachedInternship.base64.trim();
          const mime = cachedInternship.mimeType || "image/svg+xml";

          // Jika berupa SVG mentah, ubah ke base64
          if (rawBase64.startsWith("<svg") || rawBase64.includes("<svg")) {
            const base64Text = Buffer.from(rawBase64).toString("base64");
            return `data:${mime};base64,${base64Text}`;
          }

          // Jika sudah merupakan format data URL lengkap
          if (rawBase64.startsWith("data:")) {
            return rawBase64;
          }

          // Format base64 standar
          return `data:${mime};base64,${rawBase64}`;
        }
      } catch (err) {
        console.warn(
          `[InternshipService.resolveMentorSignature] Gagal mengambil cache TTD untuk internship ${internshipId}:`,
          err,
        );
      }
    }

    // 2. Fallback ke SSO jika belum dicache
    const session = await this.authSessionRepo.findSessionByMentorId(mentorId);
    const accessToken = session?.accessToken || null;
    if (!accessToken) return null;

    const signature =
      await this.ssoSignatureProxyService.getActiveSignatureByAccessToken(
        accessToken,
      );
    if (!signature?.svg) return null;

    const base64 = Buffer.from(signature.svg).toString("base64");
    return `data:${signature.mimeType || "image/svg+xml"};base64,${base64}`;
  }

  /**
   * Get complete internship data including student, submission, internship, mentor, and lecturer info
   */
  async getInternshipData(userId: string, sessionId: string) {
    // 1. Resolve Student Details from SSO first to get the correct internal Profile ID
    const studentProfile = await this.mahasiswaService.getMahasiswaById(
      userId,
      sessionId,
    );
    if (!studentProfile) {
      console.error(
        `[InternshipService.getInternshipData] CRITICAL: Mahasiswa profile not found in SSO and no local snapshot available for userId: ${userId}`,
      );
      return null;
    }

    const mahasiswaId = studentProfile.id;
    console.log(
      `[InternshipService] Fetching data for mahasiswaId: ${mahasiswaId}`,
    );

    // 2. Fetch data from local repository using the resolved mahasiswaId
    const data = await this.mahasiswaRepo.getInternshipData(mahasiswaId);
    console.log(
      `[InternshipService] Repository returned data:`,
      data ? "FOUND" : "NOT FOUND",
    );

    if (!data) {
      throw new Error("No active internship or team found for this student");
    }
    let mentor = null;
    if (data.pembimbingLapanganId) {
      // 1. Primary lookup: Find the latest request for THIS specific student
      let approvalRequest =
        await this.mentorRepo.findLatestRequestByMahasiswaId(mahasiswaId);

      // 2. If not found or doesn't match the current mentor ID, try to find by ID directly
      if (
        !approvalRequest ||
        (approvalRequest.ssoMentorId !== data.pembimbingLapanganId &&
          approvalRequest.status !== "APPROVED")
      ) {
        approvalRequest = await this.db
          .select()
          .from(mentorApprovalRequests)
          .where(
            and(
              eq(mentorApprovalRequests.status, "APPROVED"),
              or(
                eq(
                  mentorApprovalRequests.ssoMentorId,
                  data.pembimbingLapanganId,
                ),
                sql`${mentorApprovalRequests.ssoMentorId}::text = ${data.pembimbingLapanganId}::text`,
              ),
            ),
          )
          .limit(1)
          .then((res: any[]) => res[0]);
      }

      // 3. Fallback for team members: Try to find the leader's approved request if still not found
      if (!approvalRequest && data.teamId) {
        try {
          const [team] = await this.db
            .select()
            .from(teams)
            .where(eq(teams.id, data.teamId))
            .limit(1);
          if (team && team.leaderMahasiswaId !== mahasiswaId) {
            approvalRequest =
              await this.mentorRepo.findLatestRequestByMahasiswaId(
                team.leaderMahasiswaId,
              );
          }
        } catch (err) {
          console.warn(
            "[InternshipService] Failed to lookup leader request fallback:",
            err,
          );
        }
      }

      mentor = {
        id: data.pembimbingLapanganId,
        name: approvalRequest?.mentorName || "Mentor (Identity Reserved)",
        email: approvalRequest?.mentorEmail || "",
        company: approvalRequest?.companyName || data.company || "",
        position: approvalRequest?.position || "",
        phone: approvalRequest?.mentorPhone || "",
        status: approvalRequest?.status?.toLowerCase() || "approved",
        companyAddress: approvalRequest?.companyAddress || "",
        signature: await this.resolveMentorSignature(
          data.pembimbingLapanganId,
          data.internshipId || undefined,
        ),
        nip: approvalRequest?.mentorNip || "",
      };
    } else {
      let activeRequest =
        await this.mentorRepo.findLatestRequestByMahasiswaId(mahasiswaId);
      if (activeRequest) {
        mentor = {
          id: activeRequest.id,
          name: activeRequest.mentorName,
          email: activeRequest.mentorEmail,
          company: activeRequest.companyName,
          position: activeRequest.position,
          phone: activeRequest.mentorPhone,
          status: activeRequest.status.toLowerCase(),
          companyAddress: activeRequest.companyAddress,
          rejectionReason: activeRequest.rejectionReason,
          createdAt: activeRequest.createdAt,
          nip: activeRequest.mentorNip || "",
        };
      }
    }

    // Resolve Lecturer Details from SSO
    let lecturer = null;
    if (data.dosenPembimbingId) {
      const lecturerProfile = await this.dosenService.getDosenById(
        data.dosenPembimbingId,
        sessionId,
      );
      if (lecturerProfile) {
        lecturer = {
          id: data.dosenPembimbingId,
          name: lecturerProfile.profile.fullName || "",
          email:
            lecturerProfile.profile.emails.find((e) => e.isPrimary)?.email ||
            "",
          nip: lecturerProfile.nip || lecturerProfile.nidn || "",
          phone: "",
          jabatan: lecturerProfile.jabatanFungsional || "",
          signature: null, // Fetched from proxy in Pattern 1
        };
      }
    }

    const result: any = {
      student: {
        id: studentProfile.profile.id,
        name: studentProfile.profile.fullName,
        nim: studentProfile.nim,
        email:
          studentProfile.profile.emails.find((e) => e.isPrimary)?.email || "",
        prodi: studentProfile.prodi?.nama || "",
        fakultas: studentProfile.fakultas?.nama || "",
        angkatan: studentProfile.angkatan?.toString() || "",
        semester: studentProfile.semesterAktif || 0,
      },
      submission: data
        ? {
            id: data.submissionId,
            teamId: data.teamId,
            company: data.company,
            companyAddress: data.companyAddress || "",
            division: data.division || "",
            startDate: data.submissionStartDate,
            endDate: data.submissionEndDate,
            status: data.submissionStatus,
            submittedAt: data.submittedAt,
            approvedAt: data.approvedAt,
            approvedBy: data.approvedBy,
          }
        : null,
      internship:
        data && data.internshipId
          ? {
              id: data.internshipId,
              status: data.internshipStatus,
              studentId: data.studentId,
              submissionId: data.submissionId,
              mentorId: data.pembimbingLapanganId,
              supervisorId: data.dosenPembimbingId,
              startDate: data.internshipStartDate,
              endDate: data.internshipEndDate,
              createdAt: data.internshipCreatedAt,
              updatedAt: data.internshipUpdatedAt,
            }
          : null,
      mentor,
      lecturer,
      coordinator: await this.resolveCoordinator(
        studentProfile.prodi?.nama,
        sessionId,
      ),
      team: data.teamId
        ? {
            id: data.teamId,
            leaderId: null, // Will be filled below if needed
            leaderMentor: null,
          }
        : null,
    };

    // 3. If in a team, resolve leader's mentor info for "Join Leader" feature
    if (result.team && data.teamId) {
      try {
        const [team] = await this.db
          .select()
          .from(teams)
          .where(eq(teams.id, data.teamId))
          .limit(1);

        if (team) {
          result.team.leaderId = team.leaderMahasiswaId;
          console.log(
            `[InternshipService] Resolved team leaderId: ${team.leaderMahasiswaId} for team: ${data.teamId}`,
          );

          // Only show "Join Leader" if the current user is NOT the leader
          if (team.leaderMahasiswaId !== mahasiswaId) {
            const leaderInternship =
              await this.workflowRepo.getActiveInternshipByMahasiswaId(
                team.leaderMahasiswaId,
              );
            console.log(
              `[InternshipService] Leader internship found:`,
              leaderInternship ? "YES" : "NO",
            );

            if (leaderInternship?.pembimbingLapanganId) {
              const leaderMentorRequest =
                await this.mentorRepo.findRequestBySsoMentorId(
                  leaderInternship.pembimbingLapanganId,
                );
              result.team.leaderMentor = {
                id: leaderInternship.pembimbingLapanganId,
                name: leaderMentorRequest?.mentorName || "Mentor Ketua",
                company:
                  leaderMentorRequest?.companyName ||
                  leaderInternship.companyName ||
                  "",
                status:
                  leaderMentorRequest?.status?.toLowerCase() || "approved",
              };
              console.log(
                `[InternshipService] Leader mentor resolved:`,
                result.team.leaderMentor.name,
              );
            }
          }
        }
      } catch (err) {
        console.error(
          "[InternshipService] Failed to resolve team leader mentor:",
          err,
        );
      }
    }

    return result;
  }

  private async resolveCoordinator(
    prodiName: string | undefined,
    sessionId: string,
  ) {
    if (!prodiName) return null;

    try {
      // Direct search for someone with KAPRODI role in this prodi in auth_sessions
      // Ensure they are also identified as DOSEN/LECTURER to avoid students with "Kaprodi" in their name or bio
      const snapshots = await this.db
        .select()
        .from(authSessions)
        .where(
          and(
            or(
              sql`${authSessions.profileSnapshot}::text ILIKE '%"role":"KAPRODI"%'`,
              sql`${authSessions.profileSnapshot}::text ILIKE '%"role":"Ketua Program Studi"%'`,
              sql`${authSessions.profileSnapshot}::text ILIKE '%"role":"Kaprodi"%'`,
            ),
            or(
              sql`${authSessions.profileSnapshot}::text ILIKE '%"type":"DOSEN"%'`,
              sql`${authSessions.profileSnapshot}::text ILIKE '%"type":"LECTURER"%'`,
            ),
            sql`${authSessions.profileSnapshot}::text ILIKE ${"%" + prodiName + "%"}`,
          ),
        )
        .limit(1);

      if (snapshots.length === 0) {
        return {
          name: "Koordinator Program Studi",
          nip: "-",
          signature: null,
        };
      }

      const coordinatorId = snapshots[0].authUserId;
      const coordinatorProfile = await this.dosenService.getDosenById(
        coordinatorId,
        sessionId,
      );

      return {
        id: coordinatorId,
        name:
          coordinatorProfile?.profile.fullName || "Koordinator Program Studi",
        nip: coordinatorProfile?.nip || coordinatorProfile?.nidn || "-",
        signature: null,
      };
    } catch (err) {
      console.error(`[InternshipService.resolveCoordinator] Error:`, err);
      return {
        name: "Koordinator Program Studi",
        nip: "-",
        signature: null,
      };
    }
  }
}
