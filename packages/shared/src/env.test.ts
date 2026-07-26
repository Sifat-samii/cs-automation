import { describe, expect, it } from "vitest";
import { EnvValidationError, parseServerEnv } from "./env.js";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://cs_app:pw@localhost:5432/cs_automation",
  INGEST_HMAC_SECRET: "0123456789abcdef0123456789abcdef",
  BACKUP_ROOT_UNC: "\\\\192.168.0.15\\Production\\File Transfer Server\\Test",
  PRODUCTION_ROOT_UNC: "\\\\192.168.0.15\\Production\\File Server\\Test",
  STAGING_ROOT: "D:\\cs-staging",
};

describe("parseServerEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const env = parseServerEnv(valid);
    expect(env.SESSION_COOKIE_NAME).toBe("cs_session");
    expect(env.SESSION_TTL_HOURS).toBe(12);
    expect(env.SESSION_COOKIE_SECURE).toBe(false);
  });

  it("rejects a mapped drive letter used as a share root", () => {
    expect(() => parseServerEnv({ ...valid, BACKUP_ROOT_UNC: "X:\\Software Test" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects a share root that is not a UNC path", () => {
    expect(() => parseServerEnv({ ...valid, PRODUCTION_ROOT_UNC: "/mnt/production" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects an HMAC secret shorter than 32 characters", () => {
    expect(() => parseServerEnv({ ...valid, INGEST_HMAC_SECRET: "tooshort" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects a database URL that is not PostgreSQL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      EnvValidationError,
    );
  });

  it("coerces numeric strings", () => {
    expect(parseServerEnv({ ...valid, SESSION_TTL_HOURS: "8" }).SESSION_TTL_HOURS).toBe(8);
  });

  it("reports every invalid key at once", () => {
    try {
      parseServerEnv({ ...valid, INGEST_HMAC_SECRET: "x", STAGING_ROOT: "" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toHaveLength(2);
    }
  });

  it("does not include secret values in the error message", () => {
    try {
      parseServerEnv({ ...valid, INGEST_HMAC_SECRET: "supersecretbutshort" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("supersecretbutshort");
    }
  });
});
