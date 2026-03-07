import { NotFoundError } from '@/errors';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from './storage.service';
import type { DbClient } from '@/db';
import { submissions } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Team Reset Service
 * Handles cascade deletion workflow when admin rejects response letter
 * 
 * Reset Flow:
 * 1. Find submission and team data
 * 2. Delete submission documents from storage
 * 3. Delete submission (cascade deletes: documents, response letters, generated letters)
 * 4. Reset team status to PENDING
 */
export class TeamResetService {
  constructor(
    private db: DbClient,
    private submissionRepo: SubmissionRepository,
    private teamRepo: TeamRepository,
    private storageService: StorageService
  ) {}

  /**
   * Reset team workflow when response letter is rejected
   * 
   * @param submissionId - The submission ID to reset
   * @throws NotFoundError if submission not found
   */
  async resetTeamWorkflow(submissionId: string): Promise<void> {
    console.log(`[TeamResetService] Starting reset workflow for submission: ${submissionId}`);

    try {
      // 1. Find submission with team data
      const submission = await this.submissionRepo.findById(submissionId);
      if (!submission) {
        throw new NotFoundError(`Submission ${submissionId} not found`);
      }

      const teamId = submission.teamId;
      console.log(`[TeamResetService] Found submission for team: ${teamId}`);

      // 2. Get all submission documents for file deletion
      const documents = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
      console.log(`[TeamResetService] Found ${documents.length} documents to delete`);

      // 3. Delete document files from storage
      for (const doc of documents) {
        try {
          if (doc.fileUrl) {
            // Extract filename from URL and delete from storage
            const urlParts = doc.fileUrl.split('/');
            const fileName = urlParts[urlParts.length - 1];
            await this.storageService.deleteFile(`submission-documents/${fileName}`);
            console.log(`[TeamResetService] Deleted file: ${fileName}`);
          }
        } catch (error) {
          console.warn(`[TeamResetService] Failed to delete file for document ${doc.id}:`, error);
          // Continue even if file deletion fails
        }
      }

      // 4. Get generated letters for file deletion
      const generatedLettersList = await this.submissionRepo.findLettersBySubmissionId(submissionId);
      for (const letter of generatedLettersList) {
        try {
          if (letter.fileUrl) {
            const urlParts = letter.fileUrl.split('/');
            const fileName = urlParts[urlParts.length - 1];
            await this.storageService.deleteFile(`generated-letters/${fileName}`);
            console.log(`[TeamResetService] Deleted generated letter: ${fileName}`);
          }
        } catch (error) {
          console.warn(`[TeamResetService] Failed to delete generated letter:`, error);
          // Continue even if file deletion fails
        }
      }

      // 5. Delete submission (cascade deletes: documents, generated letters)
      await this.db.delete(submissions).where(eq(submissions.id, submissionId));
      console.log(`[TeamResetService] Deleted submission ${submissionId} (cascade delete triggered)`);

      // 6. Reset team status to PENDING
      await this.teamRepo.update(teamId, { status: 'PENDING' });
      console.log(`[TeamResetService] Reset team ${teamId} status to PENDING`);

      console.log(`[TeamResetService] ✅ Reset workflow completed successfully`);
    } catch (error) {
      console.error(`[TeamResetService] ❌ Error resetting team workflow:`, error);
      throw new Error(`Failed to reset team workflow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if team was reset (submission deleted but response letter exists)
   * 
   * @param submissionId - The submission ID to check
   * @returns true if team was reset, false otherwise
   */
  async checkTeamWasReset(submissionId: string): Promise<boolean> {
    try {
      // If submission doesn't exist, team was likely reset
      const submission = await this.submissionRepo.findById(submissionId);
      return !submission;
    } catch (error) {
      console.error(`[TeamResetService] Error checking reset status:`, error);
      return false;
    }
  }

  /**
   * Reset team by teamId (for student-initiated reset)
   * Finds the team's latest submission and resets the entire workflow
   * 
   * @param teamId - The team ID to reset
   * @throws NotFoundError if team not found
   */
  async resetTeamByTeamId(teamId: string): Promise<{ success: boolean; teamId: string }> {
    console.log(`[TeamResetService] Starting reset workflow for team: ${teamId}`);

    try {
      // 1. Find team
      const team = await this.teamRepo.findById(teamId);
      if (!team) {
        throw new NotFoundError(`Team ${teamId} not found`);
      }

      // 2. Find team's submissions
      const teamSubmissions = await this.submissionRepo.findByTeamId(teamId);
      console.log(`[TeamResetService] Found ${teamSubmissions.length} submission(s) for team ${teamId}`);

      // 3. If there are submissions, delete them (triggers cascade delete)
      for (const submission of teamSubmissions) {
        console.log(`[TeamResetService] Deleting submission ${submission.id}`);

        // Delete submission documents from storage
        const documents = await this.submissionRepo.findDocumentsBySubmissionId(submission.id);
        for (const doc of documents) {
          try {
            if (doc.fileUrl) {
              const urlParts = doc.fileUrl.split('/');
              const fileName = urlParts[urlParts.length - 1];
              await this.storageService.deleteFile(`submission-documents/${fileName}`);
              console.log(`[TeamResetService] Deleted file: ${fileName}`);
            }
          } catch (error) {
            console.warn(`[TeamResetService] Failed to delete file for document ${doc.id}:`, error);
          }
        }

        // Delete generated letters
        const generatedLettersList = await this.submissionRepo.findLettersBySubmissionId(submission.id);
        for (const letter of generatedLettersList) {
          try {
            if (letter.fileUrl) {
              const urlParts = letter.fileUrl.split('/');
              const fileName = urlParts[urlParts.length - 1];
              await this.storageService.deleteFile(`generated-letters/${fileName}`);
              console.log(`[TeamResetService] Deleted generated letter: ${fileName}`);
            }
          } catch (error) {
            console.warn(`[TeamResetService] Failed to delete generated letter:`, error);
          }
        }

        // Delete submission (cascade deletes related records)
        await this.db.delete(submissions).where(eq(submissions.id, submission.id));
        console.log(`[TeamResetService] Deleted submission ${submission.id}`);
      }

      // 4. Reset team status to PENDING
      await this.teamRepo.update(teamId, { status: 'PENDING' });
      console.log(`[TeamResetService] Reset team ${teamId} status to PENDING`);

      console.log(`[TeamResetService] ✅ Reset workflow completed successfully for team ${teamId}`);

      return {
        success: true,
        teamId,
      };
    } catch (error) {
      console.error(`[TeamResetService] ❌ Error resetting team:`, error);
      throw new Error(`Failed to reset team: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
