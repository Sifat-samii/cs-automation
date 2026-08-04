import { describe, expect, it } from "vitest";
import { parseFileAgentEnv } from "./config.js";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://cs_app:pw@localhost:5432/cs_automation",
  INGEST_HMAC_SECRET: "0123456789abcdef0123456789abcdef",
  BACKUP_ROOT_UNC: "\\\\server\\backup",
  PRODUCTION_ROOT_UNC: "\\\\server\\production",
  STAGING_ROOT: "D:\\cs-staging",
};

describe("File Agent configuration", () => {
  it("applies safe localhost defaults", () => {
    expect(parseFileAgentEnv(valid)).toMatchObject({
      FILE_AGENT_API_BASE_URL: "http://127.0.0.1:3000",
      FILE_AGENT_ID: "TUDB01-file-agent",
      FILE_AGENT_POLL_MS: 5_000,
    });
  });

  it("rejects a non-local API endpoint", () => {
    expect(() =>
      parseFileAgentEnv({
        ...valid,
        FILE_AGENT_API_BASE_URL: "https://external.example.com",
      }),
    ).toThrow(/local web application/iu);
  });

  it("rejects a drive-letter share root at startup", () => {
    expect(() =>
      parseFileAgentEnv({
        ...valid,
        BACKUP_ROOT_UNC: "X:\\Software Test",
      }),
    ).toThrow(/UNC path/iu);
  });
});
