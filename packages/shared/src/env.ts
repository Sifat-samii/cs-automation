import { z } from "zod";

const UNC_PREFIX = /^\\\\[^\\]+\\/;

const uncPath = z
  .string()
  .min(1)
  .refine((value) => UNC_PREFIX.test(value), {
    message: "must be a UNC path such as \\\\host\\share\\folder, not a mapped drive letter",
  });

const stagingPath = z
  .string()
  .refine((value) => /^D:\\/iu.test(value) && !value.startsWith("\\\\"), {
    message: "must be an absolute path on D: such as D:\\cs-staging",
  });

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
      message: "must be a PostgreSQL connection string",
    }),
  SESSION_COOKIE_NAME: z.string().min(1).default("cs_session"),
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(12),
  INGEST_HMAC_SECRET: z.string().min(32, "must be at least 32 characters"),
  BACKUP_ROOT_UNC: uncPath,
  PRODUCTION_ROOT_UNC: uncPath,
  STAGING_ROOT: stagingPath,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (result.success) return result.data;

  const issues = result.error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  throw new EnvValidationError(issues);
}
