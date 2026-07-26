import type { EmailExtraction } from "@/lib/ingest/extract";

export type RuleProposal = {
  kind: "CREATE_ORDER" | "ADD_BATCH" | "NO_ACTION" | "NEEDS_HUMAN";
  payload: {
    clientId: string | null;
    orderId: string | null;
    gmailThreadId: string;
    title: string;
    orderType: string;
    dropboxUrls: string[];
    driveUrls: string[];
    attachmentNames: string[];
    notes: string[];
  };
  confidence: number;
  evidence: {
    ruleId: string;
    clientMatched: boolean;
    threadMatched: boolean;
    sourceCounts: {
      dropbox: number;
      drive: number;
      attachments: number;
    };
    reasons: string[];
  };
};

export function buildRuleProposal(extraction: EmailExtraction): RuleProposal {
  const sourceCounts = {
    dropbox: extraction.dropboxUrls.length,
    drive: extraction.driveUrls.length,
    attachments: extraction.attachmentNames.length,
  };
  const hasSources = Object.values(sourceCounts).some((count) => count > 0);
  const base = {
    payload: {
      clientId: extraction.clientId,
      orderId: extraction.orderId,
      gmailThreadId: extraction.gmailThreadId,
      title: extraction.title,
      orderType: "Email intake",
      dropboxUrls: extraction.dropboxUrls,
      driveUrls: extraction.driveUrls,
      attachmentNames: extraction.attachmentNames,
      notes: extraction.notes,
    },
    evidence: {
      clientMatched: extraction.clientId !== null,
      threadMatched: extraction.orderId !== null,
      sourceCounts,
      reasons: extraction.notes,
    },
  };

  if (!extraction.clientId) {
    return {
      ...base,
      kind: "NEEDS_HUMAN",
      confidence: 1,
      evidence: {
        ...base.evidence,
        ruleId: "unknown-client",
        reasons: ["No active client identity matched the sender.", ...extraction.notes],
      },
    };
  }
  if (extraction.orderId && hasSources) {
    return {
      ...base,
      kind: "ADD_BATCH",
      confidence: 0.98,
      evidence: {
        ...base.evidence,
        ruleId: "matched-thread-with-sources",
        reasons: ["Sender matched a client and the Gmail thread matched an existing order."],
      },
    };
  }
  if (!extraction.orderId && hasSources) {
    return {
      ...base,
      kind: "CREATE_ORDER",
      confidence: 0.9,
      evidence: {
        ...base.evidence,
        ruleId: "matched-client-new-thread-with-sources",
        reasons: ["Sender matched a client and actionable file sources were found."],
      },
    };
  }
  return {
    ...base,
    kind: "NEEDS_HUMAN",
    confidence: 0.75,
    evidence: {
      ...base.evidence,
      ruleId: "client-without-actionable-sources",
      reasons: ["Sender matched a client, but no actionable file source was found."],
    },
  };
}
