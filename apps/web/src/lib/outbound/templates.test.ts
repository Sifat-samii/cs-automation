import { describe, expect, it } from "vitest";
import {
  GATE_BLOCKED_PLACEHOLDER,
  containsGateBlockedPlaceholder,
  renderOutboundTemplate,
} from "@/lib/outbound/templates";

describe("outbound templates", () => {
  it("renders pilot-approved acknowledgement as HTML email body", () => {
    const rendered = renderOutboundTemplate("ACKNOWLEDGEMENT", {
      orderCode: "VRLY_260726_001",
      clientDisplayName: "Verily",
      title: "Spring Drop",
    });
    expect(rendered.subject).toBe("Re: Spring Drop — order received (VRLY_260726_001)");
    expect(rendered.body).toBe(
      [
        "Hi Verily,",
        'Thank you for your email. We have received your request for "Spring Drop" and created order VRLY_260726_001.',
        "Our team will review the files and confirm once they are verified. If anything is missing or unclear, we will follow up in this thread.",
        "Best regards,<br>Client Support",
      ].join("<br><br>"),
    );
    expect(containsGateBlockedPlaceholder(rendered.subject, rendered.body)).toBe(false);
  });

  it("renders files verified and eta notice as HTML email bodies", () => {
    const verified = renderOutboundTemplate("FILES_VERIFIED", {
      orderCode: "VRLY_260726_001",
      clientDisplayName: "Verily",
      title: "Spring Drop",
      etaNote: "ETA follows separately.",
    });
    expect(verified.subject).toBe("Re: Spring Drop — files verified (VRLY_260726_001)");
    expect(verified.body).toContain("ETA follows separately.");
    expect(verified.body).toContain("<br><br>");
    expect(verified.body).toContain("Best regards,<br>Client Support");

    const eta = renderOutboundTemplate("ETA_NOTICE", {
      orderCode: "VRLY_260726_001",
      clientDisplayName: "Verily",
      title: "Spring Drop",
      eta: "2026-07-29",
      etaNote: "Business days only.",
    });
    expect(eta.subject).toBe("Re: Spring Drop — delivery ETA (VRLY_260726_001)");
    expect(eta.body).toContain("2026-07-29");
    expect(eta.body).toContain("Business days only.");
    expect(eta.body).toContain("<br><br>");
  });

  it("renders receipt acknowledgement as HTML without an order code", () => {
    const rendered = renderOutboundTemplate("RECEIPT_ACKNOWLEDGEMENT", {
      clientDisplayName: "Emily",
      title: "Summer Collection 2026 Order",
    });
    expect(rendered.subject).toBe("Re: Summer Collection 2026 Order — we received your email");
    expect(rendered.body).toBe(
      [
        "Hi Emily,",
        'Thank you for contacting Client Support. We have received your email regarding "Summer Collection 2026 Order".',
        "Our team is reviewing your request and will follow up in this thread shortly.",
        "Best regards,<br>Client Support",
      ].join("<br><br>"),
    );
  });

  it("escapes HTML in merge fields and omits blank eta notes", () => {
    const rendered = renderOutboundTemplate("FILES_VERIFIED", {
      orderCode: "VRLY_260726_001",
      clientDisplayName: "A <B> C",
      title: 'Drop & "Sale"',
    });
    expect(rendered.body).toContain("Hi A &lt;B&gt; C,");
    expect(rendered.body).toContain("Drop &amp; &quot;Sale&quot;");
    expect(rendered.body).not.toContain("<br><br><br>");
  });

  it("detects gate-blocked placeholder text", () => {
    expect(containsGateBlockedPlaceholder(GATE_BLOCKED_PLACEHOLDER, "ok")).toBe(true);
  });
});
