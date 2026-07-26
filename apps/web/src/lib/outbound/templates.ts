import type { OutboundTemplate } from "@cs/db";

export const GATE_BLOCKED_PLACEHOLDER = "GATE_BLOCKED_PLACEHOLDER";

type TemplateContext = {
  orderCode: string;
  clientDisplayName: string;
  title: string;
  eta?: string;
  etaNote?: string;
};

type TemplateCopy = {
  subject: string;
  body: string;
};

// Owners must replace these exact values with approved wording. Approval remains
// fail-closed while either rendered field contains the placeholder.
const TEMPLATE_COPY: Record<OutboundTemplate, TemplateCopy> = {
  ACKNOWLEDGEMENT: {
    subject: GATE_BLOCKED_PLACEHOLDER,
    body: GATE_BLOCKED_PLACEHOLDER,
  },
  FILES_VERIFIED: {
    subject: GATE_BLOCKED_PLACEHOLDER,
    body: GATE_BLOCKED_PLACEHOLDER,
  },
  ETA_NOTICE: {
    subject: GATE_BLOCKED_PLACEHOLDER,
    body: GATE_BLOCKED_PLACEHOLDER,
  },
};

function substituteMergeFields(value: string, context: TemplateContext): string {
  const replacements: Record<string, string> = {
    orderCode: context.orderCode,
    clientDisplayName: context.clientDisplayName,
    title: context.title,
    eta: context.eta ?? "",
    etaNote: context.etaNote ?? "",
  };
  return value.replace(
    /\{\{(orderCode|clientDisplayName|title|eta|etaNote)\}\}/gu,
    (_, key: string) => (key in replacements ? (replacements[key] ?? "") : ""),
  );
}

export function renderOutboundTemplate(
  template: OutboundTemplate,
  context: TemplateContext,
): TemplateCopy {
  const copy = TEMPLATE_COPY[template];
  return {
    subject: substituteMergeFields(copy.subject, context),
    body: substituteMergeFields(copy.body, context),
  };
}

export function containsGateBlockedPlaceholder(subject: string, body: string): boolean {
  return subject.includes(GATE_BLOCKED_PLACEHOLDER) || body.includes(GATE_BLOCKED_PLACEHOLDER);
}
