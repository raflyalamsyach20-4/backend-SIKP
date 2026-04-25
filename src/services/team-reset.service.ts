import { createDbClient } from '@/db';
import { NotFoundError } from '@/errors';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';

/**
 * Team Reset Service
 * Handles the "Mulai Ulang" (restart) workflow when the response letter is
 * rejected by an admin OR when a student manually triggers a restart.
 *
 * Design: submissions are ARCHIVED, not deleted.
 * This preserves the full history (documents, surat permohonan, surat kesediaan,
 * response letters) so admin and dosen can review past attempts.
 * Only the team's status is reset to PENDING so members can re-decide their
 * team composition before starting a new KP attempt.
 *
 * Reset Flow:
 * 1. Find active submission(s) for the team
 * 2. Archive each submission (set archivedAt = now) — does NOT delete unknown data
 * 3. Reset team status to PENDING
 */
export class TeamResetService {
  private submissionRepo: SubmissionRepository;
  private teamRepo: TeamRepository;

  constructor(
    env: CloudflareBindings
  ) {
    const db = createDbClient(env.DATABASE_URL);
    this.submissionRepo = new SubmissionRepository(db);
    this.teamRepo = new TeamRepository(db);
  }

  /**
   * Archive a single submission and reset the team to PENDING.
   * Called when admin verifies a rejected response letter.
   *
   * @param submissionId - The submission ID to archive
   * @throws NotFoundError if submission not found
   */
  async resetTeamWorkflow(submissionId: string): Promise<void> {
    console.log(`[TeamResetService] Starting archive workflow for submission: ${submissionId}`);

    try {
      const submission = await this.submissionRepo.findById(submissionId);
      if (!submission) {
        throw new NotFoundError(`Submission ${submissionId} not found`);
      }

      const teamId = submission.teamId;
      console.log(`[TeamResetService] Archiving submission ${submissionId} for team: ${teamId}`);

      // Archive the submission — preserves all related data (documents,
      // surat_permohonan_requests, response letters) for admin/dosen history.
      await this.submissionRepo.update(submissionId, { archivedAt: new Date() });
      console.log(`[TeamResetService] ✅ Submission ${submissionId} archived`);

      // Reset team status so members can re-decide whether to stay in the team
      await this.teamRepo.update(teamId, { status: 'PENDING' });
      console.log(`[TeamResetService] ✅ Team ${teamId} reset to PENDING`);

      console.log(`[TeamResetService] ✅ Archive workflow completed successfully`);
    } catch (error) {
      console.error(`[TeamResetService] ❌ Error in archive workflow:`, error);
      throw new Error(`Failed to reset team workflow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if the team was reset after rejection by inspecting whether the
   * submission has been archived.
   *
   * @param submissionId - The submission ID to check
   * @returns true if team was reset (submission archived), false otherwise
   */
  async checkTeamWasReset(submissionId: string): Promise<boolean> {
    try {
      const submission = await this.submissionRepo.findById(submissionId);
      if (!submission) {
        // Submission gone entirely — treat as reset
        return true;
      }
      return submission.archivedAt !== null;
    } catch (error) {
      console.error(`[TeamResetService] Error checking reset status:`, error);
      return false;
    }
  }

  /**
   * Archive all active submissions for a team and reset it to PENDING.
   * Called when a student clicks "Mulai Ulang" on the response-letter page.
   *
   * @param teamId - The team ID to reset
   * @throws NotFoundError if team not found
   */
  async resetTeamByTeamId(teamId: string): Promise<{ success: boolean; teamId: string }> {
    console.log(`[TeamResetService] Starting archive workflow for team: ${teamId}`);

    try {
      const team = await this.teamRepo.findById(teamId);
      if (!team) {
        throw new NotFoundError(`Team ${teamId} not found`);
      }

      // Find only active (non-archived) submissions
      const activeSubmissions = await this.submissionRepo.findByTeamId(teamId);
      console.log(`[TeamResetService] Found ${activeSubmissions.length} active submission(s) for team ${teamId}`);

      // Archive each active submission — preserves all related data for history
      for (const submission of activeSubmissions) {
        await this.submissionRepo.update(submission.id, { archivedAt: new Date() });
        console.log(`[TeamResetService] ✅ Archived submission ${submission.id}`);
      }

      // Reset team status to PENDING so each member can re-decide
      await this.teamRepo.update(teamId, { status: 'PENDING' });
      console.log(`[TeamResetService] ✅ Reset team ${teamId} status to PENDING`);

      console.log(`[TeamResetService] ✅ Archive workflow completed for team ${teamId}`);

      return { success: true, teamId };
    } catch (error) {
      console.error(`[TeamResetService] ❌ Error resetting team:`, error);
      throw new Error(`Failed to reset team: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

