import { describe, expect, it } from "vitest";
import type { EmailExtraction } from "@/lib/ingest/extract";
import { buildRuleProposal } from "@/lib/ingest/rules";

const base: EmailExtraction = {
  clientId: "11111111-1111-4111-8111-111111111111",
  orderId: null,
  gmailThreadId: "thread-1",
  title: "Spring drop",
  dropboxUrls: [],
  driveUrls: [],
  attachmentNames: [],
  notes: [],
};

describe("rule-only email proposals", () => {
  it("routes an unknown client to human review", () => {
    const proposal = buildRuleProposal({ ...base, clientId: null });
    expect(proposal).toMatchObject({
      kind: "NEEDS_HUMAN",
      confidence: 1,
      evidence: { ruleId: "unknown-client" },
    });
  });

  it("adds a batch when client, thread, and sources match", () => {
    const proposal = buildRuleProposal({
      ...base,
      orderId: "22222222-2222-4222-8222-222222222222",
      driveUrls: ["https://drive.google.com/file/d/abc/view"],
    });
    expect(proposal).toMatchObject({
      kind: "ADD_BATCH",
      evidence: { ruleId: "matched-thread-with-sources" },
    });
  });

  it("creates an order for a known client with sources on a new thread", () => {
    const proposal = buildRuleProposal({
      ...base,
      attachmentNames: ["brief.zip"],
    });
    expect(proposal).toMatchObject({
      kind: "CREATE_ORDER",
      evidence: { ruleId: "matched-client-new-thread-with-sources" },
    });
  });

  it("requests human review when a known client supplies no actionable sources", () => {
    const proposal = buildRuleProposal(base);
    expect(proposal).toMatchObject({
      kind: "NEEDS_HUMAN",
      evidence: { ruleId: "client-without-actionable-sources" },
    });
  });
});
