/**
 * Part B3: review and freezing rules.
 * - Every question starts as CANDIDATE. Only a named reviewer can approve, edit, or remove it.
 * - A set can be frozen with 20 to 40 approved questions. Freezing assigns the version label qs-vN.
 * - A frozen set is never edited. Any change to a frozen set creates a new draft set (copy of its approved
 *   questions); old AI results stay linked to the old set's questions.
 */

export type QuestionSetStatus = "CANDIDATE" | "APPROVED" | "FROZEN";
export type QuestionStatus = "CANDIDATE" | "APPROVED" | "REMOVED";

export const MIN_APPROVED_TO_FREEZE = 20;
export const MAX_APPROVED_TO_FREEZE = 40;

export function freezeProblem(approvedCount: number, status: QuestionSetStatus): string | null {
  if (status === "FROZEN") return "This question set is already frozen.";
  if (approvedCount < MIN_APPROVED_TO_FREEZE) return `Needs at least ${MIN_APPROVED_TO_FREEZE} approved questions to freeze (now ${approvedCount}).`;
  if (approvedCount > MAX_APPROVED_TO_FREEZE) return `At most ${MAX_APPROVED_TO_FREEZE} approved questions can be frozen (now ${approvedCount}). Remove some first.`;
  return null;
}

/** Set status while under review: APPROVED once no candidates are left undecided and the count is valid. */
export function draftStatus(counts: { candidate: number; approved: number }): QuestionSetStatus {
  return counts.candidate === 0 && counts.approved >= MIN_APPROVED_TO_FREEZE && counts.approved <= MAX_APPROVED_TO_FREEZE ? "APPROVED" : "CANDIDATE";
}

export function versionLabel(n: number): string {
  return `qs-v${n}`;
}

export type QuestionAction = "approve" | "edit" | "remove";

export function validateReviewer(name: unknown): string | null {
  if (typeof name !== "string" || name.trim().length < 2) return "reviewer name is required";
  return null;
}
