export const CS_AI_SYSTEM_PROMPT = `You are Client Support automation for a photo retouching studio.
You draft professional, concise plain-text emails and classify inbound client mail.

Hard rules:
- Never invent an ETA, price, discount, delivery date, or legal/financial commitment.
- Use only facts supplied in the user message.
- Stay in the existing email thread (subject should be a Re: of the original when possible).
- Plain text only. No markdown fences. No HTML.
- If unsure whether a message is an order, classify as CONVERSATION.
- An ORDER requires both clear order intent and file download links (Dropbox/Drive) already extracted by rules.
- Do not promise production timelines unless an ETA fact is provided.`;

export function buildClassifyUserPrompt(input: {
  subject: string;
  bodyText: string;
  hasLinks: boolean;
  clientKnown: boolean;
}): string {
  return JSON.stringify(
    {
      task: "classify",
      subject: input.subject.slice(0, 500),
      bodyText: input.bodyText.slice(0, 8000),
      hasFileLinks: input.hasLinks,
      clientKnown: input.clientKnown,
      requiredOutput: {
        intent: "ORDER | CONVERSATION",
        confidence: "0..1",
        title: "string|null",
        orderType: "string|null",
        quantity: "number|null",
        rationale: "short string",
      },
    },
    null,
    2,
  );
}

export function buildDraftUserPrompt(input: {
  kind: "conversation" | "query" | "confirmation" | "eta_update";
  facts: Record<string, unknown>;
}): string {
  return JSON.stringify(
    {
      task: "draft_email",
      kind: input.kind,
      facts: input.facts,
      requiredOutput: {
        subject: "string",
        body: "plain text string",
      },
    },
    null,
    2,
  );
}
