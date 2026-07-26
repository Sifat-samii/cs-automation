import { serverEnvSchema } from "@cs/shared";
import { z } from "zod";

const localAgentUrl = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (value) =>
      (value.protocol === "http:" || value.protocol === "https:") &&
      (value.hostname === "localhost" ||
        value.hostname === "127.0.0.1" ||
        value.hostname === "[::1]"),
    {
      message: "must target the local web application",
    },
  )
  .transform((value) => value.toString().replace(/\/$/u, ""));

export const fileAgentEnvSchema = serverEnvSchema.extend({
  FILE_AGENT_API_BASE_URL: localAgentUrl.default("http://127.0.0.1:3000"),
  FILE_AGENT_ID: z.string().trim().min(1).max(200).default("TUDB01-file-agent"),
  FILE_AGENT_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  FILE_AGENT_HEARTBEAT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
});

export type FileAgentEnv = z.infer<typeof fileAgentEnvSchema>;

export function parseFileAgentEnv(raw: Record<string, string | undefined>): FileAgentEnv {
  const result = fileAgentEnvSchema.safeParse(raw);
  if (result.success) return result.data;
  const issues = result.error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  throw new Error(`Invalid File Agent configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
}
