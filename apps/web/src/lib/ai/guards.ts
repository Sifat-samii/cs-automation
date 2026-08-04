const BANNED_COMMITMENT =
  /\b(guarantee|guaranteed|we promise|free of charge|discount of|%\s*off|invoice\s*#?\s*\d+)\b/iu;
const DATE_LIKE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/iu;

export type DraftFacts = {
  eta?: string | null;
  allowDates?: boolean;
};

export function assertNoUnsafeCommitments(body: string, facts: DraftFacts): void {
  if (BANNED_COMMITMENT.test(body)) {
    throw new Error("AI draft contains a banned commitment phrase");
  }
  const etaProvided = Boolean(facts.eta) || facts.allowDates === true;
  if (!etaProvided && DATE_LIKE.test(body)) {
    throw new Error("AI draft invents a date without an ETA fact");
  }
}
