import type { OutboundTemplate } from "@cs/db";

export const GATE_BLOCKED_PLACEHOLDER = "GATE_BLOCKED_PLACEHOLDER";

export type TemplateContext = {
  orderCode?: string;
  clientDisplayName: string;
  title: string;
  eta?: string;
  etaNote?: string;
};

type TemplateCopy = {
  subject: string;
  body: string;
};

// Pilot-approved local dry-run copy (2026-07-26). Not final brand/legal wording.
// Bodies are authored as plain text, then rendered to HTML for Gmail (emailType: html).
// Approval remains fail-closed while either rendered field contains GATE_BLOCKED_PLACEHOLDER.
const TEMPLATE_COPY: Record<OutboundTemplate, TemplateCopy> = {
  ACKNOWLEDGEMENT: {
    subject: "Re: {{title}} — order received ({{orderCode}})",
    body: `Hi {{clientDisplayName}},

Thank you for your email. We have received your request for "{{title}}" and created order {{orderCode}}.

Our team will review the files and confirm once they are verified. If anything is missing or unclear, we will follow up in this thread.

Best regards,
Client Support`,
  },
  RECEIPT_ACKNOWLEDGEMENT: {
    subject: "Re: {{title}} — we received your email",
    body: `Hi {{clientDisplayName}},

Thank you for contacting Client Support. We have received your email regarding "{{title}}".

Our team is reviewing your request and will follow up in this thread shortly.

Best regards,
Client Support`,
  },
  FILES_VERIFIED: {
    subject: "Re: {{title}} — files verified ({{orderCode}})",
    body: `Hi {{clientDisplayName}},

The files for order {{orderCode}} ("{{title}}") have been verified and are ready for production.

{{etaNote}}

We will keep you updated in this thread if anything changes.

Best regards,
Client Support`,
  },
  ETA_NOTICE: {
    subject: "Re: {{title}} — delivery ETA ({{orderCode}})",
    body: `Hi {{clientDisplayName}},

For order {{orderCode}} ("{{title}}"), our current estimated delivery date is {{eta}}.

{{etaNote}}

Please reply in this thread if you need any adjustment.

Best regards,
Client Support`,
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function substituteMergeFields(
  value: string,
  context: TemplateContext,
  options: { htmlEscape: boolean },
): string {
  const replacements: Record<string, string> = {
    orderCode: context.orderCode ?? "",
    clientDisplayName: context.clientDisplayName,
    title: context.title,
    eta: context.eta ?? "",
    etaNote: context.etaNote ?? "",
  };
  return value.replace(
    /\{\{(orderCode|clientDisplayName|title|eta|etaNote)\}\}/gu,
    (_, key: string) => {
      const raw = key in replacements ? (replacements[key] ?? "") : "";
      return options.htmlEscape ? escapeHtml(raw) : raw;
    },
  );
}

/** Convert plain-text paragraphs into HTML suitable for Gmail emailType=html. */
export function plainTextToEmailHtml(body: string): string {
  return body
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n{2,}/u)
    .map((block) => block.trim().replaceAll("\n", "<br>"))
    .filter((block) => block.length > 0)
    .join("<br><br>");
}

export function renderOutboundTemplate(
  template: OutboundTemplate,
  context: TemplateContext,
): TemplateCopy {
  const copy = TEMPLATE_COPY[template];
  return {
    subject: substituteMergeFields(copy.subject, context, { htmlEscape: false }),
    body: plainTextToEmailHtml(substituteMergeFields(copy.body, context, { htmlEscape: true })),
  };
}

export function containsGateBlockedPlaceholder(subject: string, body: string): boolean {
  return subject.includes(GATE_BLOCKED_PLACEHOLDER) || body.includes(GATE_BLOCKED_PLACEHOLDER);
}
