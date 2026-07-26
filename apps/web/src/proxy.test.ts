import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("application proxy", () => {
  it("allows HMAC-only agent endpoints through without a browser session", () => {
    const response = proxy(
      new NextRequest(
        "http://localhost/api/agent/jobs/11111111-1111-4111-8111-111111111111/complete",
        {
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("continues to redirect protected browser routes without a session", () => {
    const response = proxy(new NextRequest("http://localhost/orders"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });
});
