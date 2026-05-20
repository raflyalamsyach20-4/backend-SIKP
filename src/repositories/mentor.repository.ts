import { eq, and, or, desc, sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  internships,
  assessments,
  mentorApprovalRequests,
  teams,
} from "@/db/schema";
import { generateId } from "@/utils/helpers";

export interface CreateAssessmentData {
  internshipId?: string;
  studentUserId?: string;
  kehadiran: number;
  kerjasama: number;
  sikapEtika: number;
  prestasiKerja: number;
  kreatifitas: number;
  components?: any[];
  feedback?: string;
}

export interface UpdateAssessmentData {
  kehadiran?: number;
  kerjasama?: number;
  sikapEtika?: number;
  prestasiKerja?: number;
  kreatifitas?: number;
  components?: any[];
  feedback?: string;
}

export class MentorRepository {
  constructor(private db: DbClient) {}

  // ─── Mentees ────────────────────────────────────────────────────────────────

  /**
   * Get all mentees supervised by this mentor
   * Note: Mentee details (name, nim) should be resolved by the service/controller.
   */
  async getMentees(
    mentorProfileId: string,
    identityId: string,
    mentorEmail?: string,
  ) {
    console.log(`[MentorRepository.getMentees] DEBUG: Searching mentees for:`);
    console.log(`  - mentorProfileId: "${mentorProfileId}"`);
    console.log(`  - identityId: "${identityId}"`);
    console.log(`  - mentorEmail: "${mentorEmail}"`);
    try {
      // 1. Get all internships where pembimbing_lapangan_id matches any of our IDs
      const directMatches = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
          createdAt: internships.createdAt,
        })
        .from(internships)
        .where(
          or(
            eq(internships.pembimbingLapanganId, mentorProfileId),
            eq(internships.pembimbingLapanganId, identityId),
          ),
        );

      // 2. Get mentees via mentorApprovalRequests (using IDs or Email)
      const approvalMatches = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
          createdAt: internships.createdAt,
        })
        .from(internships)
        .innerJoin(
          mentorApprovalRequests,
          eq(internships.mahasiswaId, mentorApprovalRequests.studentUserId),
        )
        .where(
          and(
            eq(mentorApprovalRequests.status, "APPROVED"),
            or(
              eq(mentorApprovalRequests.ssoMentorId, identityId),
              eq(mentorApprovalRequests.ssoMentorId, mentorProfileId),
              mentorEmail
                ? eq(mentorApprovalRequests.mentorEmail, mentorEmail)
                : undefined,
            ),
          ),
        );

      // 3. Email fallback: Resolve mentor IDs from approved requests and find all associated internships
      let emailMatches: any[] = [];
      if (mentorEmail) {
        // Step A: Find all students who have an approved request with this email
        const studentsWithRequest = await this.db
          .select({ studentId: mentorApprovalRequests.studentUserId })
          .from(mentorApprovalRequests)
          .where(
            and(
              eq(mentorApprovalRequests.mentorEmail, mentorEmail),
              eq(mentorApprovalRequests.status, "APPROVED"),
            ),
          );

        const studentIds = studentsWithRequest.map((s) => s.studentId);

        if (studentIds.length > 0) {
          // Step B: Get the pembimbing_lapangan_id (Profile UUID) used by these students
          const mentorProfileIds = await this.db
            .select({ profileId: internships.pembimbingLapanganId })
            .from(internships)
            .where(
              and(
                or(...studentIds.map((id) => eq(internships.mahasiswaId, id))),
                sql`${internships.pembimbingLapanganId} IS NOT NULL`,
              ),
            );

          const profileIds = mentorProfileIds
            .map((m) => m.profileId)
            .filter(Boolean) as string[];

          if (profileIds.length > 0) {
            // Step C: Find ALL internships (including team members) sharing these Profile IDs
            emailMatches = await this.db
              .select({
                internshipId: internships.id,
                internshipStatus: internships.status,
                internshipStartDate: internships.startDate,
                internshipEndDate: internships.endDate,
                companyName: internships.companyName,
                division: internships.division,
                studentId: internships.mahasiswaId,
                createdAt: internships.createdAt,
              })
              .from(internships)
              .where(
                or(
                  ...profileIds.map((id) =>
                    eq(internships.pembimbingLapanganId, id),
                  ),
                ),
              );
          }
        }
      }

      // Combine and deduplicate
      const allResults = [
        ...directMatches,
        ...approvalMatches,
        ...emailMatches,
      ];
      const seen = new Set();
      const deduplicated = allResults.filter((r) => {
        if (seen.has(r.internshipId)) return false;
        seen.add(r.internshipId);
        return true;
      });

      // Sort by createdAt desc
      deduplicated.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );

      console.log(
        `[MentorRepository.getMentees] Combined results count: ${deduplicated.length}`,
      );
      return deduplicated;
    } catch (error) {
      console.error("[MentorRepository.getMentees] Error:", error);
      throw error;
    }
  }

  async getMenteeByStudentId(
    mentorProfileId: string,
    identityId: string,
    studentUserId: string,
    mentorEmail?: string,
  ) {
    try {
      const results = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
          teamId: internships.teamId,
          pembimbingLapanganId: internships.pembimbingLapanganId,
        })
        .from(internships)
        .leftJoin(
          mentorApprovalRequests,
          eq(internships.mahasiswaId, mentorApprovalRequests.studentUserId),
        )
        .where(eq(internships.mahasiswaId, studentUserId))
        .limit(1);

      const internship = results[0];
      if (!internship) return null;

      // 1. Direct ID match
      if (
        internship.studentId === studentUserId &&
        (internship.pembimbingLapanganId === mentorProfileId ||
          internship.pembimbingLapanganId === identityId)
      ) {
        return internship;
      }

      // 2. Team-based bridge
      if (internship.teamId) {
        const [team] = await this.db
          .select()
          .from(teams)
          .where(eq(teams.id, internship.teamId))
          .limit(1);
        if (team) {
          const leaderRequest = await this.db
            .select()
            .from(mentorApprovalRequests)
            .where(
              and(
                eq(
                  mentorApprovalRequests.studentUserId,
                  team.leaderMahasiswaId,
                ),
                eq(mentorApprovalRequests.status, "APPROVED"),
                or(
                  eq(mentorApprovalRequests.mentorEmail, mentorEmail || ""),
                  eq(mentorApprovalRequests.ssoMentorId, identityId),
                  eq(mentorApprovalRequests.ssoMentorId, mentorProfileId),
                ),
              ),
            )
            .limit(1)
            .then((res) => res[0]);

          if (leaderRequest) return internship;
        }
      }

      // 3. Email fallback
      if (mentorEmail) {
        const approvedRequest = await this.db
          .select()
          .from(mentorApprovalRequests)
          .where(
            and(
              eq(mentorApprovalRequests.mentorEmail, mentorEmail),
              eq(mentorApprovalRequests.status, "APPROVED"),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (approvedRequest) return internship;
      }

      return null;
    } catch (error) {
      console.error("[MentorRepository.getMenteeByStudentId] Error:", error);
      throw error;
    }
  }

  /**
   * Get active internship ID for a student
   */
  async getInternshipIdByStudentId(
    studentUserId: string,
  ): Promise<string | null> {
    try {
      const result = await this.db
        .select({ id: internships.id })
        .from(internships)
        .where(eq(internships.mahasiswaId, studentUserId))
        .limit(1);
      return result[0]?.id ?? null;
    } catch (error) {
      console.error(
        "[MentorRepository.getInternshipIdByStudentId] Error:",
        error,
      );
      throw error;
    }
  }

  /**
   * Get internship ID for a mentee supervised by this mentor
   */
  async getInternshipIdForMentee(
    mentorProfileId: string,
    identityId: string,
    studentUserId: string,
    mentorEmail?: string,
  ): Promise<string | null> {
    try {
      // 1. Direct check by student ID
      const internship = await this.db
        .select({
          id: internships.id,
          pembimbingLapanganId: internships.pembimbingLapanganId,
        })
        .from(internships)
        .where(eq(internships.mahasiswaId, studentUserId))
        .limit(1)
        .then((res) => res[0]);

      if (!internship) return null;

      // 2. Check if this internship belongs to the mentor via any of the direct IDs
      if (
        internship.pembimbingLapanganId === mentorProfileId ||
        internship.pembimbingLapanganId === identityId
      ) {
        return internship.id;
      }

      // 3. Team-based validation (Bridge for members)
      if (internship.id) {
        try {
          // Find the student's team
          const [studentInternship] = await this.db
            .select()
            .from(internships)
            .where(eq(internships.id, internship.id))
            .limit(1);

          if (studentInternship?.teamId) {
            const [team] = await this.db
              .select()
              .from(teams)
              .where(eq(teams.id, studentInternship.teamId))
              .limit(1);

            if (team) {
              // Check if leader has an approved request for this mentor
              const leaderRequest = await this.db
                .select()
                .from(mentorApprovalRequests)
                .where(
                  and(
                    eq(
                      mentorApprovalRequests.studentUserId,
                      team.leaderMahasiswaId,
                    ),
                    eq(mentorApprovalRequests.status, "APPROVED"),
                    or(
                      eq(mentorApprovalRequests.mentorEmail, mentorEmail || ""),
                      eq(mentorApprovalRequests.ssoMentorId, identityId),
                      eq(mentorApprovalRequests.ssoMentorId, mentorProfileId),
                    ),
                  ),
                )
                .limit(1)
                .then((res) => res[0]);

              if (leaderRequest) {
                return internship.id;
              }
            }
          }
        } catch (err) {
          console.warn(
            "[MentorRepository.getInternshipIdForMentee] Team validation failed:",
            err,
          );
        }
      }

      // 4. Robust email-based fallback
      if (mentorEmail) {
        // Find if there's any approved request for this mentor email that links to this pembimbingLapanganId
        const approvedRequest = await this.db
          .select()
          .from(mentorApprovalRequests)
          .where(
            and(
              eq(mentorApprovalRequests.mentorEmail, mentorEmail),
              eq(mentorApprovalRequests.status, "APPROVED"),
              or(
                eq(
                  mentorApprovalRequests.ssoMentorId,
                  internship.pembimbingLapanganId || "",
                ),
                // Bridge Identity ID and Profile UUID
                sql`${mentorApprovalRequests.ssoMentorId}::text = ${internship.pembimbingLapanganId}::text`,
              ),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (approvedRequest) {
          return internship.id;
        }
      }

      // 5. Direct ID bridge (if no email provided)
      const approvedRequests = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(
          and(
            eq(mentorApprovalRequests.status, "APPROVED"),
            or(
              eq(mentorApprovalRequests.ssoMentorId, identityId),
              eq(mentorApprovalRequests.ssoMentorId, mentorProfileId),
              internship.pembimbingLapanganId
                ? eq(
                    mentorApprovalRequests.ssoMentorId,
                    internship.pembimbingLapanganId,
                  )
                : undefined,
            ),
          ),
        );

      if (approvedRequests.length > 0) {
        return internship.id;
      }

      return null;
    } catch (error) {
      console.error(
        "[MentorRepository.getInternshipIdForMentee] Error:",
        error,
      );
      throw error;
    }
  }

  // ─── Assessments ────────────────────────────────────────────────────────────

  private computeTotal(data: {
    kehadiran: number;
    kerjasama: number;
    sikapEtika: number;
    prestasiKerja: number;
    kreatifitas: number;
    components?: any[];
  }) {
    // If we have dynamic components, calculate based on them
    if (data.components && data.components.length > 0) {
      let total = 0;
      for (const comp of data.components) {
        const score = Number(comp.score) || 0;
        const weight = Number(comp.weight) || 0;
        total += score * (weight / 100);
      }
      return Math.round(total);
    }

    // Fallback to legacy hardcoded calculation
    return Math.round(
      data.kehadiran * 0.2 +
        data.kerjasama * 0.3 +
        data.sikapEtika * 0.2 +
        data.prestasiKerja * 0.2 +
        data.kreatifitas * 0.1,
    );
  }

  async createAssessment(mentorId: string, data: CreateAssessmentData) {
    try {
      const id = generateId();
      const now = new Date();
      const totalScore = this.computeTotal(data);

      await this.db.insert(assessments).values({
        id,
        internshipId: data.internshipId!,
        pembimbingLapanganId: mentorId,
        kehadiran: data.kehadiran,
        kerjasama: data.kerjasama,
        sikapEtika: data.sikapEtika,
        prestasiKerja: data.prestasiKerja,
        kreatifitas: data.kreatifitas,
        totalScore,
        components: data.components || [],
        feedback: data.feedback ?? null,
        isLocked: true, // Always locked after creation
        assessedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return this.findAssessmentById(id);
    } catch (error) {
      console.error("[MentorRepository.createAssessment] Error:", error);
      throw error;
    }
  }

  async findAssessmentById(id: string) {
    try {
      const result = await this.db
        .select()
        .from(assessments)
        .where(eq(assessments.id, id))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error("[MentorRepository.findAssessmentById] Error:", error);
      throw error;
    }
  }

  async getAssessmentByInternshipId(internshipId: string) {
    try {
      const result = await this.db
        .select()
        .from(assessments)
        .where(eq(assessments.internshipId, internshipId))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error(
        "[MentorRepository.getAssessmentByInternshipId] Error:",
        error,
      );
      throw error;
    }
  }

  async updateAssessment(id: string, data: UpdateAssessmentData) {
    try {
      const existing = await this.findAssessmentById(id);
      if (!existing) return null;

      const merged = {
        kehadiran: data.kehadiran ?? existing.kehadiran,
        kerjasama: data.kerjasama ?? existing.kerjasama,
        sikapEtika: data.sikapEtika ?? existing.sikapEtika,
        prestasiKerja: data.prestasiKerja ?? existing.prestasiKerja,
        kreatifitas: data.kreatifitas ?? existing.kreatifitas,
      };

      const totalScore = this.computeTotal(merged);

      await this.db
        .update(assessments)
        .set({
          ...merged,
          totalScore,
          components:
            data.components !== undefined
              ? data.components
              : existing.components,
          feedback:
            data.feedback !== undefined ? data.feedback : existing.feedback,
          isLocked: true, // Re-lock after update
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, id));

      return this.findAssessmentById(id);
    } catch (error) {
      console.error("[MentorRepository.updateAssessment] Error:", error);
      throw error;
    }
  }

  async unlockAssessment(id: string) {
    try {
      await this.db
        .update(assessments)
        .set({
          isLocked: false,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, id));
      return this.findAssessmentById(id);
    } catch (error) {
      console.error("[MentorRepository.unlockAssessment] Error:", error);
      throw error;
    }
  }

  // ─── Profile & Signature ───────────────────────────────────────────────────

  async findProfileById(id: string) {
    // Table deleted as per Pola 1 migration
    return null;
  }

  async updateProfile(id: string, data: any) {
    // Table deleted as per Pola 1 migration
    return null;
  }

  // ─── Approval Requests ─────────────────────────────────────────────────────

  async findRequestBySsoMentorId(ssoMentorId: string) {
    try {
      // Search for any approved request that has this SSO ID (could be Profile ID or Identity ID)
      const result = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(
          and(
            eq(mentorApprovalRequests.status, "APPROVED"),
            or(
              eq(mentorApprovalRequests.ssoMentorId, ssoMentorId),
              // Fallback: check if the name or email matches is not possible here,
              // but we can try to find by profileId if it was mistakenly stored in another field
              // For now, let's just make it search by ssoMentorId
            ),
          ),
        )
        .limit(1);

      if (result.length > 0) return result[0];

      // If not found by ssoMentorId, it might be a direct link.
      // Try to find ANY approved request to get mentor metadata
      const fallback = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(eq(mentorApprovalRequests.status, "APPROVED"))
        .limit(10); // Get a few to see if we can find a better match elsewhere if needed

      return result[0] ?? null;
    } catch (error) {
      console.error(
        "[MentorRepository.findRequestBySsoMentorId] Error:",
        error,
      );
      throw error;
    }
  }

  async findLatestRequestByMahasiswaId(mahasiswaId: string) {
    try {
      const result = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(eq(mentorApprovalRequests.studentUserId, mahasiswaId))
        .orderBy(desc(mentorApprovalRequests.createdAt))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error(
        "[MentorRepository.findLatestRequestByMahasiswaId] Error:",
        error,
      );
      throw error;
    }
  }
}
