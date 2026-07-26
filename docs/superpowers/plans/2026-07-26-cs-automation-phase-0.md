---
name: CS Automation MVP
overview: "Phase 0 implementation plan for the CS Automation system: monorepo foundation, validated configuration, PostgreSQL schema with an append-only audit trail, in-house session authentication with CS_EXECUTIVE / CS_LEAD roles, a Next.js app shell with login and a protected dashboard, CI, and the SMB copy-strategy benchmark that de-risks the File Agent phase."
todos:
  - id: task-01
    content: "Task 1: Repository foundation, design spec, and ADRs"
    status: pending
  - id: task-02
    content: "Task 2: Monorepo tooling (workspaces, TypeScript, ESLint, Prettier, Vitest)"
    status: pending
  - id: task-03
    content: "Task 3: packages/shared - validated environment configuration"
    status: pending
  - id: task-04
    content: "Task 4: packages/shared - HMAC request signing and argon2id password hashing"
    status: pending
  - id: task-05
    content: "Task 5: packages/db - PostgreSQL schema, append-only audit trigger, test harness"
    status: pending
  - id: task-06
    content: "Task 6: Next.js workspace scaffold and session management"
    status: pending
  - id: task-07
    content: "Task 7: Role permissions and the transactional audit helper"
    status: pending
  - id: task-08
    content: "Task 8: Next.js app shell, login flow, protected dashboard"
    status: pending
  - id: task-09
    content: "Task 9: GitHub Actions CI pipeline"
    status: pending
  - id: task-10
    content: "Task 10: SMB copy-strategy benchmark spike"
    status: pending
  - id: task-11
    content: "Task 11: Final verification and Phase 0 sign-off"
    status: pending
isProject: false
---

# CS Automation Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the CS Automation monorepo with a migrated PostgreSQL schema, working authentication with role separation, a tamper-proof audit trail, and green CI, so that Phase 1 can build order domain logic on a verified foundation.

**Architecture:** An npm-workspaces monorepo with two pure library packages (`packages/shared` for I/O-free logic, `packages/db` for Prisma) and one application (`apps/web`, Next.js App Router). PostgreSQL is the source of truth. Authentication uses argon2id password hashing with opaque session tokens stored as SHA-256 hashes, so a database leak cannot grant sessions. The audit table is protected by a database trigger, not just application convention.

**Tech Stack:** Node 24, TypeScript (strict), Next.js App Router, Tailwind, Prisma, PostgreSQL 18, Zod, `@node-rs/argon2`, Vitest, ESLint, Prettier, GitHub Actions.

## Global Constraints

- Target machine is Windows 10 Pro; the shell is PowerShell 5.1, which does **not** support `&&` as a statement separator. Chain commands with `;` or run them separately.
- Never reference `X:` or `Z:` in code or configuration. Only UNC paths: backup is `\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test`, production is `\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test`.
- All persisted timestamps are UTC, `timestamptz`.
- No secrets in the repository. `.env` is git-ignored; `.env.example` carries placeholder values only.
- TypeScript `strict` is on everywhere. `any` is prohibited without an inline comment justifying it.
- Never log passwords, tokens, session identifiers, or HMAC secrets.
- Every task ends with a commit. Conventional Commits format.
- Do not create `apps/file-agent` in this phase. It arrives in Phase 2.

## Context for someone with zero background

The Client Support team receives image-retouching orders by email, downloads client files from Dropbox or Google Drive, stores them on a backup share, copies them to a production share for the retouching department, and communicates deadlines back to the client. All of it is manual today. This system automates intake through file placement while keeping a human approval gate on every client-facing action.

The full design, including findings from inspecting the live servers, is written to `docs/specs/2026-07-26-cs-automation-design.md` in Task 1. Read that file before starting Task 2.

## File structure created by this phase

```
.gitignore  .gitattributes  .editorconfig  .env.example  README.md
package.json                 npm workspaces root, all verification scripts
tsconfig.base.json           strict compiler options shared by every package
eslint.config.mjs            flat config for packages/*
.prettierrc.json
vitest.config.ts             single root config, node environment
docs/
  specs/2026-07-26-cs-automation-design.md
  project-context.md  architecture.md  risks.md
  unresolved-questions.md  implementation-status.md
  decisions/0001..0005-*.md
packages/shared/src/
  env.ts      env.test.ts       Zod-validated configuration
  hmac.ts     hmac.test.ts      request signing for n8n and the File Agent
  password.ts password.test.ts  argon2id hashing, shared by the app and the seed
  index.ts
packages/db/
  prisma/schema.prisma  prisma/migrations/  prisma/seed.ts
  src/index.ts  src/testing.ts
apps/web/src/
  lib/auth/session.ts   session.test.ts
  lib/auth/rbac.ts      rbac.test.ts
  lib/auth/current-user.ts
  lib/audit.ts          audit.test.ts
  app/login/page.tsx    app/login/actions.ts
  app/(app)/layout.tsx  app/(app)/dashboard/page.tsx
  app/(app)/loading.tsx app/(app)/error.tsx
  middleware.ts
scripts/spike-copy-benchmark.ps1
.github/workflows/ci.yml
```

Rationale for the split: `packages/shared` holds the logic most likely to cause a production incident (path handling, signing, configuration) and has no I/O, so it is exhaustively unit-testable offline. `packages/db` isolates Prisma so the schema has one owner. `apps/web` depends on both and never reaches for Prisma internals directly.

---

### Task 1: Repository foundation, design spec, and ADRs

**Files:**

- Create: `.gitignore`, `.gitattributes`, `.editorconfig`, `README.md`
- Create: `docs/specs/2026-07-26-cs-automation-design.md`
- Create: `docs/project-context.md`, `docs/architecture.md`, `docs/risks.md`, `docs/unresolved-questions.md`, `docs/implementation-status.md`
- Create: `docs/decisions/0001-postgresql-is-source-of-truth.md` through `0005-order-folder-naming.md`

**Interfaces:**

- Consumes: nothing.
- Produces: the `docs/` tree that every later task appends to, and the git branch structure `main`, `develop`, `feature/project-foundation`.

- [ ] **Step 1: Initialise the repository and branches**

```powershell
git init
git checkout -b main
git commit --allow-empty -m "chore: initialise repository"
git checkout -b develop
git checkout -b feature/project-foundation
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.next/
out/
dist/
build/
coverage/
*.tsbuildinfo
.env
.env.local
.env.test
.env.*.local
!.env.example
npm-debug.log*
.DS_Store
Thumbs.db
packages/db/generated/
docs/benchmarks/*.local.md
```

- [ ] **Step 3: Create `.gitattributes`**

Source files use LF so CI on Linux and the Windows box agree. PowerShell and batch files keep CRLF because some Windows hosts mis-parse LF scripts.

```gitattributes
* text=auto eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
*.jpg binary
*.tif binary
```

- [ ] **Step 4: Create `.editorconfig`**

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.{ps1,bat,cmd}]
end_of_line = crlf

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Write the design spec**

Create `docs/specs/2026-07-26-cs-automation-design.md`. Copy the Architecture, Components, Data model, Naming convention, Client communication, Transfer pipeline, Failure handling, and Testing sections from this plan document, and add the two sections below. Every one of these facts was verified on the machine and must appear:

- Verified environment: `TUDB01`, i5-10400, 32 GB RAM, Windows 10 Pro 22H2; PostgreSQL 18.4, Git 2.54, Node 24, npm 12, Ollama 0.32 with `qwen3:8b` and `qwen3-embedding:0.6b`; no Docker. Local free space: `C:` 57.3 GB, `D:` 278.4 GB, `E:` 174.9 GB, `F:` 59.2 GB.
- `X:` and `Z:` resolve to `\\192.168.0.15\Production\File Transfer Server` and `\\192.168.0.15\Production\File Server` respectively, which are two folders on **one** share on **one** server, so the backup is not independent.
- Existing share layout is `<ClientCode>\<OrderFolder>` with a reserved `_Final Done` folder per client; observed client codes are `DPBP`, `FN`, `Vrly`.
- Order folder naming is `VRLY_260726_001__kirkland_spring_drop`, resolved by prefix, with a hidden `.cs-order.json` marker recording the order ID.
- Two client emails: acknowledgement on intake approval, then files-verified including the ETA if set, with a separate ETA message if not.
- Order files are 100-330 MB each, so a typical order is 3-5 GB; staging is `D:\cs-staging`.
- Volume is 20-100 emails and 5-20 orders per day.

- [ ] **Step 6: Write the five ADRs**

Each ADR uses the sections: Context, Decision, Alternatives considered, Consequences, Status, Date.

`0001-postgresql-is-source-of-truth.md` — n8n and Google Sheets hold no authoritative state; Sheets becomes a one-way mirror in a later phase. Consequence: production staff depend on the sheet, so the mirror must ship before go-live.

`0002-unc-paths-not-drive-letters.md` — A Windows service running as LocalSystem cannot resolve per-user mapped drives, so `X:` and `Z:` would fail in production while working in manual testing. All path configuration uses UNC, and both services run under an account with share permissions. Consequence: the service account must be provisioned before Phase 2.

`0003-ai-is-advisory-only.md` — The GT 1030 has 2 GB VRAM and cannot host the model, so inference is CPU-only at 3-6 tokens/sec. Deterministic rules own client resolution, thread correlation, and link extraction; the model only proposes intent and free-text fields, validated against a Zod schema, and every proposal passes through human approval. Consequence: the review inbox must render rule-based proposals immediately and apply model refinements asynchronously.

`0004-in-house-session-authentication.md` — Users are internal CS staff only and no external identity provider is required. Decision: argon2id hashing via `@node-rs/argon2` plus opaque 32-byte session tokens stored as SHA-256 hashes in PostgreSQL. Alternatives: Auth.js v5, rejected because its credentials flow adds substantial beta-churn surface for a feature set we do not use; Lucia, rejected as deprecated. Consequences: we own session rotation and expiry, which is covered by tests. Known limitation: the app will initially run over plain HTTP on the LAN, so the session cookie cannot set `Secure`; HTTPS is required before handling anything beyond internal use.

`0005-order-folder-naming.md` — Hybrid `CODE_YYMMDD_NNN__human_suffix`, resolved by prefix, with a hidden marker file. Alternatives: canonical-only, rejected as opaque to production staff; client-supplied names, rejected because they collide and produce the `- Copy` sprawl already visible on the share. Consequence: the path builder must enforce a length cap because the backup UNC root is already 102 characters against a 260-character Windows limit.

- [ ] **Step 7: Write the remaining docs**

`docs/project-context.md` — the manual process being replaced, in the team's own terms.
`docs/architecture.md` — the five processes on `TUDB01` and the trust boundaries between them.
`docs/risks.md` — X: is not an independent backup; plain HTTP on the LAN; CPU-only inference latency; `C:` at 57 GB free; both share roots contain unmanaged human debris.
`docs/unresolved-questions.md` — Pixofix API availability; Dropbox and Drive credentials for authenticated links; the UNC service account; the Google Sheets cutover plan; `qwen3:4b` versus `qwen3:8b`.
`docs/implementation-status.md` — a table of the six phases with Phase 0 marked in progress.

- [ ] **Step 8: Write `README.md`**

Must cover: what the system does in three sentences, prerequisites (Node 24, PostgreSQL 18, PowerShell), first-time setup, the verification commands, and an explicit warning that PowerShell 5.1 rejects `&&`.

- [ ] **Step 9: Commit**

```powershell
git add .
git commit -m "docs: add design spec, ADRs, and repository conventions"
```

---

### Task 2: Monorepo tooling

**Files:**

- Create: `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `vitest.config.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/smoke.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1 except the repository itself.
- Produces: the workspace scripts every later task runs — `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` — and the `@cs/shared` package name that `apps/web` imports.

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "cs-automation",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "run-s typecheck:packages typecheck:web",
    "typecheck:packages": "tsc --build --force",
    "typecheck:web": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "npm run build --workspaces --if-present",
    "db:generate": "npm run generate --workspace @cs/db",
    "db:migrate": "npm run migrate --workspace @cs/db",
    "db:migrate:deploy": "npm run migrate:deploy --workspace @cs/db",
    "db:seed": "npm run seed --workspace @cs/db",
    "verify": "run-s typecheck lint format:check test build"
  }
}
```

The original semicolon-separated scripts fail because npm executes package scripts through `cmd.exe`
on Windows, where `;` is not a command separator. Use the cross-platform `run-s` binary from
`npm-run-all2` so typecheck and verification stay sequential without using `&&`. The workspace
typecheck uses `--workspaces --if-present` because npm 12 errors on a nonexistent named `@cs/web`
workspace before Task 6 creates it.

- [ ] **Step 2: Install root development dependencies**

```powershell
npm install -D typescript @types/node vitest eslint @eslint/js typescript-eslint prettier dotenv npm-run-all2
```

Pin `eslint` and `@eslint/js` to major 9 while Next.js 16 is present. Its bundled React plugin is
not compatible with ESLint 10 (`contextOrFilename.getFilename is not a function`); the pin changes
no lint rules or strictness.

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "composite": true,
    "sourceMap": true
  }
}
```

`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are deliberate. They are noisy in a mature codebase but nearly free at day zero, and they catch the class of bug that produces `undefined` in a file path.

- [ ] **Step 3b: Create the root `tsconfig.json`**

`tsc --build` needs a root project to build from. During Task 2 it references only
`packages/shared`; the `packages/db` reference is added in Task 5 after that task creates
`packages/db/tsconfig.json`. This deferral fixes the original plan sequencing defect. `apps/web`
uses the non-composite tsconfig that Next.js generates and cannot participate in project references.

```json
{
  "files": [],
  "references": [{ "path": "./packages/shared" }]
}
```

- [ ] **Step 4: Create `packages/shared/package.json`**

```json
{
  "name": "@cs/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc --build" }
}
```

- [ ] **Step 5: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist", "types": ["node"] },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

TypeScript 6 no longer auto-includes the installed Node declarations for this composite workspace
in this environment, so `types: ["node"]` is explicit. This does not change strictness.

- [ ] **Step 6: Create `.prettierrc.json` and `eslint.config.mjs`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
```

- [ ] **Step 7: Create `vitest.config.ts`**

A single root config rather than a workspace file, because the Vitest workspace API has changed across recent majors and one config avoids that risk. `fileParallelism` is disabled because Task 6 introduces tests that share one database.

The aliases matter. Without them, tests importing `@cs/shared` resolve through the package `main` field to `dist/`, which means every test run would require a build first. Pointing them at source keeps the suite fast and removes a build-ordering trap. The `@/` alias mirrors the one Next.js configures for `apps/web`.

```typescript
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@cs/shared": resolvePath("./packages/shared/src/index.ts"),
      "@cs/db/testing": resolvePath("./packages/db/src/testing.ts"),
      "@cs/db": resolvePath("./packages/db/src/index.ts"),
      "@": resolvePath("./apps/web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

`@cs/db/testing` is listed before `@cs/db` because Vitest matches string aliases by prefix in order, and the shorter key would otherwise swallow the subpath.

```typescript
// vitest.setup.ts
import { config } from "dotenv";

config({ path: ".env.test" });
```

- [ ] **Step 8: Write the smoke test**

```typescript
// packages/shared/src/smoke.test.ts
import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@cs/shared", () => {
  it("is wired into the workspace", () => {
    expect(packageName).toBe("@cs/shared");
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/smoke.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 10: Create the minimal `packages/shared/src/index.ts`**

```typescript
export const packageName = "@cs/shared";
```

- [ ] **Step 11: Run the full verification**

Run: `npm run verify`
Expected: typecheck, lint, format check, and the smoke test all pass. `build` succeeds with no workspace producing output yet beyond `@cs/shared`.

- [ ] **Step 12: Commit**

```powershell
git add .
git commit -m "chore: set up npm workspaces, TypeScript, ESLint, Prettier, and Vitest"
```

---

### Task 3: Validated environment configuration

**Files:**

- Create: `packages/shared/src/env.ts`
- Test: `packages/shared/src/env.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `.env.example`

**Interfaces:**

- Consumes: `packageName` export pattern from Task 2.
- Produces:
  - `serverEnvSchema: ZodType<ServerEnv>`
  - `type ServerEnv = { NODE_ENV: "development" | "test" | "production"; DATABASE_URL: string; SESSION_COOKIE_NAME: string; SESSION_COOKIE_SECURE: boolean; SESSION_TTL_HOURS: number; INGEST_HMAC_SECRET: string; BACKUP_ROOT_UNC: string; PRODUCTION_ROOT_UNC: string; STAGING_ROOT: string }`
  - `parseServerEnv(raw: Record<string, string | undefined>): ServerEnv` — throws `EnvValidationError` listing every invalid key.
  - `class EnvValidationError extends Error { readonly issues: readonly string[] }`

- [ ] **Step 1: Install Zod into the shared package**

```powershell
npm install zod --workspace @cs/shared
```

- [ ] **Step 2: Write the failing tests**

The UNC test is the important one. It encodes ADR 0002 as an executable rule, so nobody can quietly configure a drive letter and discover the failure only once the code runs as a Windows service.

```typescript
// packages/shared/src/env.test.ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/shared/src/env.test.ts`
Expected: FAIL — cannot resolve `./env.js`.

- [ ] **Step 4: Implement `env.ts`**

`.url()` and other format helpers are avoided because their location moved between Zod majors; `refine` behaves identically across both.

```typescript
import { z } from "zod";

const UNC_PREFIX = /^\\\\[^\\]+\\/;

const uncPath = z
  .string()
  .min(1)
  .refine((value) => UNC_PREFIX.test(value), {
    message: "must be a UNC path such as \\\\host\\share\\folder, not a mapped drive letter",
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
  STAGING_ROOT: z.string().min(3),
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
```

The error message deliberately reports the failing key and the rule, never the submitted value, which is why the final test asserts the secret does not appear in the message.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/shared/src/env.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Export from the package index**

```typescript
// packages/shared/src/index.ts
export const packageName = "@cs/shared";
export { serverEnvSchema, parseServerEnv, EnvValidationError } from "./env.js";
export type { ServerEnv } from "./env.js";
```

- [ ] **Step 7: Create `.env.example`**

```dotenv
NODE_ENV=development

# PostgreSQL. cs_app owns the cs_automation database and is not a superuser.
DATABASE_URL=postgresql://cs_app:CHANGE_ME@localhost:5432/cs_automation

# Session cookie. Set SESSION_COOKIE_SECURE=true once the app is served over HTTPS.
SESSION_COOKIE_NAME=cs_session
SESSION_COOKIE_SECURE=false
SESSION_TTL_HOURS=12

# Shared secret for HMAC-signed requests from n8n and the File Agent.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
INGEST_HMAC_SECRET=CHANGE_ME_32_CHARACTERS_MINIMUM

# UNC paths only. Mapped drive letters are invisible to a Windows service.
BACKUP_ROOT_UNC=\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test
PRODUCTION_ROOT_UNC=\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test

# Staging lives on D: because C: has only 57 GB free and orders run 3-5 GB.
STAGING_ROOT=D:\cs-staging
```

- [ ] **Step 8: Create `.env.test` locally (not committed)**

Copy `.env.example`, set `NODE_ENV=test` and `DATABASE_URL=postgresql://cs_app:...@localhost:5432/cs_automation_test`. Confirm `git status` does not list it.

- [ ] **Step 9: Commit**

```powershell
git add .
git commit -m "feat(shared): add Zod-validated environment configuration"
```

---

### Task 4: Cryptographic primitives — HMAC signing and password hashing

**Files:**

- Create: `packages/shared/src/hmac.ts`, `packages/shared/src/password.ts`
- Test: `packages/shared/src/hmac.test.ts`, `packages/shared/src/password.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `signRequest(input: { secret: string; timestamp: string; body: string }): string` — lowercase hex SHA-256 HMAC.
  - `verifyRequest(input: { secret: string; timestamp: string; body: string; signature: string; toleranceSeconds?: number; now?: Date }): VerifyResult`
  - `type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" }`
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(storedHash: string, plain: string): Promise<boolean>`

HMAC is written before it is needed because Phase 3 has n8n posting to the ingest endpoint and Phase 2 has the File Agent leasing jobs; both need the same primitive.

Password hashing lives here rather than in `apps/web` because two consumers need it: the login action and the database seed script. Keeping one copy means the OWASP cost parameters cannot drift between them. It is CPU work with no I/O, so it does not violate this package's boundary.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/hmac.test.ts
import { describe, expect, it } from "vitest";
import { signRequest, verifyRequest } from "./hmac.js";

const secret = "0123456789abcdef0123456789abcdef";
const body = JSON.stringify({ gmailMessageId: "abc123" });
const now = new Date("2026-07-26T00:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));

describe("signRequest", () => {
  it("produces a stable lowercase hex digest", () => {
    const signature = signRequest({ secret, timestamp, body });
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signRequest({ secret, timestamp, body })).toBe(signature);
  });

  it("produces a different digest for a different body", () => {
    const a = signRequest({ secret, timestamp, body });
    const b = signRequest({ secret, timestamp, body: body + " " });
    expect(a).not.toBe(b);
  });
});

describe("verifyRequest", () => {
  it("accepts a correctly signed request", () => {
    const signature = signRequest({ secret, timestamp, body });
    expect(verifyRequest({ secret, timestamp, body, signature, now })).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const signature = signRequest({ secret, timestamp, body });
    const result = verifyRequest({
      secret,
      timestamp,
      body: '{"gmailMessageId":"evil"}',
      signature,
      now,
    });
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a signature made with a different secret", () => {
    const signature = signRequest({ secret: "f".repeat(32), timestamp, body });
    expect(verifyRequest({ secret, timestamp, body, signature, now })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a timestamp outside the replay window", () => {
    const old = String(Math.floor(now.getTime() / 1000) - 400);
    const signature = signRequest({ secret, timestamp: old, body });
    expect(verifyRequest({ secret, timestamp: old, body, signature, now })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects a future timestamp outside the window", () => {
    const future = String(Math.floor(now.getTime() / 1000) + 400);
    const signature = signRequest({ secret, timestamp: future, body });
    expect(verifyRequest({ secret, timestamp: future, body, signature, now })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifyRequest({ secret, timestamp, body, signature: "nothex", now })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyRequest({ secret, timestamp: "yesterday", body, signature: "a".repeat(64), now }),
    ).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
```

The malformed-signature test matters because `timingSafeEqual` throws on buffers of unequal length. Without the guard, an attacker sending a short signature crashes the endpoint.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/shared/src/hmac.test.ts`
Expected: FAIL — cannot resolve `./hmac.js`.

- [ ] **Step 3: Implement `hmac.ts`**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;
const HEX_SIGNATURE = /^[0-9a-f]{64}$/;

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" };

export function signRequest(input: { secret: string; timestamp: string; body: string }): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`, "utf8")
    .digest("hex");
}

export function verifyRequest(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  toleranceSeconds?: number;
  now?: Date;
}): VerifyResult {
  const { secret, timestamp, body, signature } = input;
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = input.now ?? new Date();

  if (!HEX_SIGNATURE.test(signature)) return { ok: false, reason: "malformed" };

  const sent = Number(timestamp);
  if (!Number.isInteger(sent)) return { ok: false, reason: "malformed" };

  const skew = Math.abs(Math.floor(now.getTime() / 1000) - sent);
  if (skew > tolerance) return { ok: false, reason: "stale" };

  const expected = Buffer.from(signRequest({ secret, timestamp, body }), "hex");
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length) return { ok: false, reason: "malformed" };

  return timingSafeEqual(expected, provided) ? { ok: true } : { ok: false, reason: "mismatch" };
}
```

The timestamp is checked before the digest is computed, so a replayed request is rejected without spending CPU on HMAC.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/shared/src/hmac.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Install argon2 and write the failing password tests**

`@node-rs/argon2` ships prebuilt native binaries. The alternative `argon2` package requires node-gyp and Visual Studio build tools, which is a poor dependency to introduce on a Windows box.

```powershell
npm install @node-rs/argon2 --workspace @cs/shared
```

```typescript
// packages/shared/src/password.test.ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("produces an argon2id hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("produces a different hash for the same password each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run packages/shared/src/password.test.ts`
Expected: FAIL — cannot resolve `./password.js`.

- [ ] **Step 7: Implement `password.ts`**

```typescript
import { hash, verify } from "@node-rs/argon2";

// OWASP Password Storage Cheat Sheet, argon2id: m=19456 KiB, t=2, p=1.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
```

Returning `false` on a malformed stored hash rather than propagating means a corrupted row denies login instead of returning a 500 that leaks the failure mode.

- [ ] **Step 8: Run to verify the tests pass**

Run: `npx vitest run packages/shared/src/password.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Export and commit**

Add to `packages/shared/src/index.ts`:

```typescript
export { signRequest, verifyRequest } from "./hmac.js";
export type { VerifyResult } from "./hmac.js";
export { hashPassword, verifyPassword } from "./password.js";
```

```powershell
npm run verify
git add .
git commit -m "feat(shared): add HMAC request signing and argon2id password hashing"
```

---

### Task 5: Database schema, append-only audit, and test harness

**Files:**

- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_init/migration.sql` (generated, then hand-edited)
- Create: `packages/db/src/index.ts`, `packages/db/src/testing.ts`
- Create: `packages/db/prisma/seed.ts`
- Create: `scripts/setup-database.sql`
- Test: `packages/db/src/audit-immutability.test.ts`

**Interfaces:**

- Consumes: `DATABASE_URL` validated in Task 3.
- Produces:
  - `prisma: PrismaClient` — the shared singleton, exported from `@cs/db`.
  - `type DbClient = PrismaClient | Prisma.TransactionClient` — the type every function that must work inside a transaction accepts.
  - `resetDatabase(client: PrismaClient): Promise<void>` — truncates all tables, imported by tests from the separate `@cs/db/testing` entry point.
  - Prisma models `User`, `Session`, `AuditEvent` and enum `UserRole`.

- [ ] **Step 1: Create the databases and the application role**

Run as the PostgreSQL superuser. `cs_app` owns its databases so it can run migrations, but it is not a superuser and cannot reach anything else on the server. Splitting migration and runtime roles is deferred and recorded in `docs/unresolved-questions.md`.

```sql
-- scripts/setup-database.sql
CREATE ROLE cs_app WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE cs_automation OWNER cs_app;
CREATE DATABASE cs_automation_test OWNER cs_app;
```

```powershell
psql -U postgres -f scripts/setup-database.sql
```

Local provisioning deviation approved during execution: this machine already has the non-superuser
application role `"TUUO_CS"` and development database `cs_webapp`. The isolated test database is
`cs_webapp_test`, also owned by `"TUUO_CS"`. Local ignored environment files carry those URLs;
`scripts/setup-database.sql` records only the remaining test-database creation.

- [ ] **Step 2: Create the package and install Prisma**

```json
{
  "name": "@cs/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./testing": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" }
  },
  "scripts": {
    "build": "tsc --build",
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "seed": "node prisma/seed.ts"
  },
  "prisma": { "schema": "prisma/schema.prisma" }
}
```

The test helper is a separate export rather than part of the main entry point, so a function that truncates every table can never be imported by accident from application code.

`seed` runs the TypeScript file directly because Node 24 strips types natively. Do not add `--experimental-strip-types`; that flag belonged to Node 22 and 23.

```powershell
npm install @prisma/client @cs/shared --workspace @cs/db
npm install -D prisma --workspace @cs/db
```

```json
// packages/db/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist", "types": ["node"] },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "prisma/**"]
}
```

`prisma/seed.ts` is excluded from the build because Node runs it directly with native type stripping. It is therefore not type-checked; keep it small and free of logic worth testing.

The implementation pins Prisma 6.x because this plan uses the Prisma 6 `datasource.url` and
`prisma-client-js` configuration. Prisma 7 requires a separate configuration and adapter migration
that is outside this phase. As with `packages/shared`, TypeScript 6 needs explicit Node declarations
for this composite package.

- [ ] **Step 3: Write `schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  CS_EXECUTIVE
  CS_LEAD
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  displayName  String
  passwordHash String
  role         UserRole
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  sessions    Session[]
  auditEvents AuditEvent[]
}

model Session {
  id         String   @id @default(uuid()) @db.Uuid
  tokenHash  String   @unique
  userId     String   @db.Uuid
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  lastSeenAt DateTime @default(now()) @db.Timestamptz(6)

  @@index([userId])
  @@index([expiresAt])
}

model AuditEvent {
  id            String   @id @default(uuid()) @db.Uuid
  occurredAt    DateTime @default(now()) @db.Timestamptz(6)
  correlationId String   @db.Uuid
  actorUserId   String?  @db.Uuid
  actor         User?    @relation(fields: [actorUserId], references: [id], onDelete: SetNull)
  actorLabel    String
  action        String
  entityType    String
  entityId      String
  metadata      Json     @default("{}")

  @@index([entityType, entityId])
  @@index([occurredAt])
  @@index([correlationId])
}
```

`actorLabel` is denormalised on purpose. If a user record is later removed, `actorUserId` becomes null but the audit trail still records who acted, which is the entire point of keeping it.

- [ ] **Step 4: Generate the migration**

Invoke Prisma directly rather than through the root script. Passing `--name` through two layers of `npm run` makes npm consume the flag instead of forwarding it.

```powershell
npm exec --workspace @cs/db -- prisma migrate dev --name init
```

Expected: a new folder under `packages/db/prisma/migrations/` containing `migration.sql`, and the tables created in `cs_automation`.

- [ ] **Step 5: Append the append-only trigger to the migration**

Add this to the end of the generated `migration.sql`. Application-level discipline is not enough for an audit trail; the database must refuse the write.

```sql
CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();

CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
```

- [ ] **Step 6: Re-apply the migration from clean**

Prisma will report drift because the migration file was edited after being applied. Reset the development database so the edited file is the one that runs:

```powershell
npm exec --workspace @cs/db -- prisma migrate reset --force
```

Expected: the migration applies cleanly and both triggers exist. Confirm with:

```powershell
psql -U cs_app -d cs_automation -c "\dS+ \"AuditEvent\"" | Select-String "Triggers" -Context 0,3
```

- [ ] **Step 7: Write `src/index.ts`**

```typescript
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { Prisma, PrismaClient } from "@prisma/client";
export type { User, Session, AuditEvent, UserRole } from "@prisma/client";
```

The singleton guard prevents Next.js hot reload from opening a new connection pool on every edit, which otherwise exhausts PostgreSQL connections within minutes of development.

Note the log configuration excludes `query`, so parameter values never reach the logs.

- [ ] **Step 8: Write `src/testing.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";

export async function resetDatabase(client: PrismaClient): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("resetDatabase refused: DATABASE_URL does not point at a test database");
  }
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditEvent", "Session", "User" RESTART IDENTITY CASCADE',
  );
}
```

The guard is deliberate. A test helper that truncates tables must be incapable of running against the production database.

`TRUNCATE` bypasses row-level triggers, so it clears `AuditEvent` despite the delete trigger. That is the intended behaviour for a test reset and does not weaken the production guarantee, because the application role never issues `TRUNCATE`.

- [ ] **Step 9: Write the immutability test**

```typescript
// packages/db/src/audit-immutability.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./index.js";
import { resetDatabase } from "./testing.js";

const correlationId = "11111111-1111-4111-8111-111111111111";

async function insertEvent() {
  return prisma.auditEvent.create({
    data: {
      correlationId,
      actorUserId: null,
      actorLabel: "system",
      action: "test.performed",
      entityType: "Test",
      entityId: "1",
    },
  });
}

describe("AuditEvent immutability", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows inserts", async () => {
    const event = await insertEvent();
    expect(event.id).toBeTruthy();
    expect(event.metadata).toEqual({});
  });

  it("refuses updates at the database level", async () => {
    const event = await insertEvent();
    await expect(
      prisma.auditEvent.update({ where: { id: event.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/i);
  });

  it("refuses deletes at the database level", async () => {
    const event = await insertEvent();
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it("stores timestamps with timezone in UTC", async () => {
    const event = await insertEvent();
    expect(event.occurredAt.toISOString()).toMatch(/Z$/);
  });
});
```

- [ ] **Step 10: Run the tests against the test database**

Prisma reads `DATABASE_URL` from the process environment, and `.env.test` is only loaded by the Vitest setup file, so the migration command needs the variable set explicitly in the shell.

```powershell
$env:DATABASE_URL = "postgresql://cs_app:CHANGE_ME@localhost:5432/cs_automation_test"
npm exec --workspace @cs/db -- prisma migrate deploy
Remove-Item Env:\DATABASE_URL
npx vitest run packages/db/src/audit-immutability.test.ts
```

Expected: PASS, 4 tests. If `resetDatabase` throws "refused", `.env.test` is not pointing at a database whose name contains `_test`.

- [ ] **Step 11: Write the seed script**

```typescript
// packages/db/prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@cs/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, displayName: "CS Lead", passwordHash, role: "CS_LEAD" },
  });

  console.warn(`Seeded CS_LEAD account for ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
```

The credentials come from the environment and are never written into the repository, and the script refuses a weak password rather than silently creating a trivially guessable admin.

- [ ] **Step 12: Commit**

```powershell
npm run verify
git add .
git commit -m "feat(db): add User, Session, and append-only AuditEvent schema"
```

---

### Task 6: Next.js workspace and session management

**Files:**

- Create: `apps/web/` (scaffolded by `create-next-app`)
- Create: `apps/web/src/lib/auth/session.ts`
- Test: `apps/web/src/lib/auth/session.test.ts`

**Interfaces:**

- Consumes: `prisma`, `DbClient`, `UserRole` from `@cs/db`; `resetDatabase` from `@cs/db/testing`; `hashPassword` from `@cs/shared`.
- Produces:
  - `generateSessionToken(): string` — 32 random bytes, base64url.
  - `hashSessionToken(token: string): string` — SHA-256 hex.
  - `createSession(db: DbClient, input: { userId: string; ttlHours: number; now?: Date }): Promise<{ token: string; expiresAt: Date }>`
  - `validateSessionToken(db: DbClient, token: string, now?: Date): Promise<SessionUser | null>`
  - `type SessionUser = { userId: string; email: string; displayName: string; role: UserRole }`
  - `invalidateSession(db: DbClient, token: string): Promise<void>`
  - `invalidateAllSessionsForUser(db: DbClient, userId: string): Promise<void>`

- [ ] **Step 1: Scaffold the Next.js application**

The app is scaffolded here rather than in Task 8 so that nothing has to be reconciled later against a folder `create-next-app` refuses to write into.

```powershell
npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept the defaults for anything prompted. Then set `"name": "@cs/web"` in `apps/web/package.json`, add a `"typecheck": "tsc --noEmit"` script, and install the workspace dependencies:

```powershell
npm install @cs/db @cs/shared --workspace @cs/web
```

The Next.js 16.2 scaffold imports Google-hosted Geist fonts by default, making every clean build
depend on an external request. Remove those default remote-font imports and retain a local system
font stack so `npm run verify` and CI builds are deterministic offline.

As of the implementation date, `npm audit` also reports upstream high-severity findings in the
PostCSS and optional Sharp versions pinned by Next.js 16.2.12, plus the ESLint 9 dependency chain.
The suggested forced fix incorrectly downgrades Next to 9.3.3, so do not apply it. Track the risk,
avoid untrusted image/CSS processing in this phase, and upgrade when compatible upstream releases
are available.

Within `apps/web`, follow the Next.js import convention: no `.js` extensions on relative imports, and the `@/` alias for anything outside the current folder. Only `packages/shared` and `packages/db` use explicit `.js` extensions, because those compile under `moduleResolution: NodeNext`.

- [ ] **Step 2: Write the failing session tests**

```typescript
// apps/web/src/lib/auth/session.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { hashPassword } from "@cs/shared";
import {
  createSession,
  generateSessionToken,
  hashSessionToken,
  invalidateAllSessionsForUser,
  invalidateSession,
  validateSessionToken,
} from "./session";

const now = new Date("2026-07-26T00:00:00.000Z");

async function makeUser() {
  return prisma.user.create({
    data: {
      email: "exec@example.com",
      displayName: "Test Executive",
      passwordHash: await hashPassword("a-long-enough-password"),
      role: "CS_EXECUTIVE",
    },
  });
}

describe("session management", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("generates distinct high-entropy tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it("never stores the raw token", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(rows[0]?.tokenHash).not.toBe(token);
  });

  it("resolves a valid token to its user", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    const resolved = await validateSessionToken(prisma, token, now);
    expect(resolved).toEqual({
      userId: user.id,
      email: "exec@example.com",
      displayName: "Test Executive",
      role: "CS_EXECUTIVE",
    });
  });

  it("rejects an unknown token", async () => {
    await expect(validateSessionToken(prisma, generateSessionToken(), now)).resolves.toBeNull();
  });

  it("rejects an expired session and removes it", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    const later = new Date(now.getTime() + 13 * 60 * 60 * 1000);
    await expect(validateSessionToken(prisma, token, later)).resolves.toBeNull();
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("rejects a session belonging to a deactivated user", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(validateSessionToken(prisma, token, now)).resolves.toBeNull();
  });

  it("invalidates a single session", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await invalidateSession(prisma, token);
    await expect(validateSessionToken(prisma, token, now)).resolves.toBeNull();
  });

  it("invalidates every session for a user", async () => {
    const user = await makeUser();
    await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await invalidateAllSessionsForUser(prisma, user.id);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("removes sessions when the user is deleted", async () => {
    const user = await makeUser();
    await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await prisma.user.delete({ where: { id: user.id } });
    await expect(prisma.session.count()).resolves.toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run apps/web/src/lib/auth/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 4: Implement `session.ts`**

```typescript
import { createHash, randomBytes } from "node:crypto";
import type { DbClient, UserRole } from "@cs/db";

export type SessionUser = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSession(
  db: DbClient,
  input: { userId: string; ttlHours: number; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + input.ttlHours * 60 * 60 * 1000);

  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: input.userId,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    },
  });

  return { token, expiresAt };
}

export async function validateSessionToken(
  db: DbClient,
  token: string,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  const tokenHash = hashSessionToken(token);

  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt <= now) {
    await db.session.delete({ where: { tokenHash } });
    return null;
  }

  if (!session.user.isActive) return null;

  await db.session.update({ where: { tokenHash }, data: { lastSeenAt: now } });

  return {
    userId: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function invalidateSession(db: DbClient, token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function invalidateAllSessionsForUser(db: DbClient, userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
```

Three properties are worth stating because they are easy to lose in a later refactor: the raw token exists only in the cookie and never in the database; expired sessions are deleted on the read path so a dead token cannot linger; and a deactivated user is rejected immediately, so disabling an account takes effect on the next request rather than at session expiry.

- [ ] **Step 5: Run to verify the tests pass**

Run: `npx vitest run apps/web/src/lib/auth/session.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```powershell
npm run verify
git add .
git commit -m "feat(web): scaffold Next.js app and add hashed-token session management"
```

---

### Task 7: Role permissions and the transactional audit helper

**Files:**

- Create: `apps/web/src/lib/auth/rbac.ts`, `apps/web/src/lib/audit.ts`
- Test: `apps/web/src/lib/auth/rbac.test.ts`, `apps/web/src/lib/audit.test.ts`

**Interfaces:**

- Consumes: `DbClient`, `prisma`, `UserRole` from `@cs/db`; `resetDatabase` from `@cs/db/testing`; `hashPassword` from `@cs/shared`.
- Produces:
  - `type Permission = "user:manage" | "audit:read"`
  - `can(role: UserRole, permission: Permission): boolean`
  - `assertCan(role: UserRole, permission: Permission): void` — throws `ForbiddenError`.
  - `class ForbiddenError extends Error { readonly permission: Permission }`
  - `recordAudit(db: DbClient, input: AuditInput): Promise<void>`
  - `type AuditInput = { correlationId: string; actorUserId: string | null; actorLabel: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }`

Only the two permissions Phase 0 actually enforces are defined. Later phases add their own; inventing them now would be speculative.

- [ ] **Step 1: Write the failing RBAC tests**

```typescript
// apps/web/src/lib/auth/rbac.test.ts
import { describe, expect, it } from "vitest";
import { ForbiddenError, assertCan, can } from "./rbac";

describe("role permissions", () => {
  it("grants user management to CS_LEAD only", () => {
    expect(can("CS_LEAD", "user:manage")).toBe(true);
    expect(can("CS_EXECUTIVE", "user:manage")).toBe(false);
  });

  it("grants audit reading to CS_LEAD only", () => {
    expect(can("CS_LEAD", "audit:read")).toBe(true);
    expect(can("CS_EXECUTIVE", "audit:read")).toBe(false);
  });

  it("assertCan passes for a permitted role", () => {
    expect(() => assertCan("CS_LEAD", "user:manage")).not.toThrow();
  });

  it("assertCan throws ForbiddenError naming the permission", () => {
    try {
      assertCan("CS_EXECUTIVE", "user:manage");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).permission).toBe("user:manage");
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/web/src/lib/auth/rbac.test.ts`
Expected: FAIL — cannot resolve `./rbac.js`.

- [ ] **Step 3: Implement `rbac.ts`**

```typescript
import type { UserRole } from "@cs/db";

export type Permission = "user:manage" | "audit:read";

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  CS_EXECUTIVE: [],
  CS_LEAD: ["user:manage", "audit:read"],
};

export class ForbiddenError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
```

Typing the map as `Record<UserRole, ...>` means adding a role to the Prisma enum without granting it permissions becomes a compile error rather than a silent deny.

- [ ] **Step 4: Run to verify the tests pass**

Run: `npx vitest run apps/web/src/lib/auth/rbac.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing audit tests**

```typescript
// apps/web/src/lib/audit.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { hashPassword } from "@cs/shared";
import { recordAudit } from "./audit";

const correlationId = "22222222-2222-4222-8222-222222222222";

async function makeUser() {
  return prisma.user.create({
    data: {
      email: "lead@example.com",
      displayName: "Test Lead",
      passwordHash: await hashPassword("a-long-enough-password"),
      role: "CS_LEAD",
    },
  });
}

describe("recordAudit", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("writes an event with actor and entity", async () => {
    const user = await makeUser();
    await recordAudit(prisma, {
      correlationId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: "user.signed_in",
      entityType: "User",
      entityId: user.id,
    });

    const events = await prisma.auditEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("user.signed_in");
    expect(events[0]?.actorUserId).toBe(user.id);
  });

  it("redacts sensitive keys from metadata", async () => {
    await recordAudit(prisma, {
      correlationId,
      actorUserId: null,
      actorLabel: "system",
      action: "integration.called",
      entityType: "Integration",
      entityId: "n8n",
      metadata: {
        endpoint: "/api/ingest/email",
        password: "hunter2",
        apiToken: "abc",
        authorization: "Bearer xyz",
        hmacSecret: "s3cret",
      },
    });

    const event = await prisma.auditEvent.findFirstOrThrow();
    const metadata = event.metadata as Record<string, unknown>;
    expect(metadata.endpoint).toBe("/api/ingest/email");
    expect(metadata.password).toBe("[redacted]");
    expect(metadata.apiToken).toBe("[redacted]");
    expect(metadata.authorization).toBe("[redacted]");
    expect(metadata.hmacSecret).toBe("[redacted]");
  });

  it("rolls back with the surrounding transaction", async () => {
    const user = await makeUser();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { displayName: "Renamed" } });
        await recordAudit(tx, {
          correlationId,
          actorUserId: user.id,
          actorLabel: user.email,
          action: "user.renamed",
          entityType: "User",
          entityId: user.id,
        });
        throw new Error("deliberate failure");
      }),
    ).rejects.toThrow("deliberate failure");

    await expect(prisma.auditEvent.count()).resolves.toBe(0);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.displayName).toBe("Test Lead");
  });

  it("preserves the actor label after the user is deleted", async () => {
    const user = await makeUser();
    await recordAudit(prisma, {
      correlationId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: "user.signed_in",
      entityType: "User",
      entityId: user.id,
    });

    await prisma.user.delete({ where: { id: user.id } });

    const event = await prisma.auditEvent.findFirstOrThrow();
    expect(event.actorUserId).toBeNull();
    expect(event.actorLabel).toBe("lead@example.com");
  });
});
```

The rollback test is the one that matters most. It proves audit entries cannot survive a failed operation, which is what makes the trail trustworthy rather than merely present.

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run apps/web/src/lib/audit.test.ts`
Expected: FAIL — cannot resolve `./audit.js`.

- [ ] **Step 7: Implement `audit.ts`**

```typescript
import type { DbClient } from "@cs/db";

export type AuditInput = {
  correlationId: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY = /pass|secret|token|authorization|credential|cookie|hash/i;

function redact(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[redacted]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      output[key] = redact(value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export async function recordAudit(db: DbClient, input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: redact(input.metadata ?? {}),
    },
  });
}

export { redact as redactForTesting };
```

`recordAudit` takes a `DbClient` rather than reaching for the singleton, which is precisely what lets a caller pass a transaction handle and get atomicity for free. Redaction recurses into nested objects because integration payloads nest their credentials.

- [ ] **Step 8: Run to verify the tests pass**

Run: `npx vitest run apps/web/src/lib/audit.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Commit**

```powershell
npm run verify
git add .
git commit -m "feat(auth): add role permissions and transactional audit helper"
```

---

### Task 8: Next.js app shell, login, protected dashboard

**Files:**

- Create/modify: `apps/web/next.config.ts`, `apps/web/package.json`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/actions.ts`
- Create: `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/dashboard/page.tsx`
- Create: `apps/web/src/app/(app)/loading.tsx`, `apps/web/src/app/(app)/error.tsx`
- Create: `apps/web/src/lib/auth/current-user.ts`
- Create: `apps/web/src/middleware.ts`

**Interfaces:**

- Consumes: `validateSessionToken`, `createSession`, `invalidateSession`, `SessionUser` (Task 6); `hashPassword`, `verifyPassword`, `parseServerEnv` from `@cs/shared` (Tasks 3 and 4); `recordAudit` (Task 7); `prisma` (Task 5).
- Produces:
  - `getCurrentUser(): Promise<SessionUser | null>`
  - `requireUser(): Promise<SessionUser>` — redirects to `/login` when absent.
  - Server actions `signIn(prevState, formData)` and `signOut()`.

- [ ] **Step 1: Mark the native and Prisma packages external to the server bundle**

The application was scaffolded in Task 6; this task only adds configuration and pages.

```typescript
// apps/web/next.config.ts
import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],
};

export default config;
```

Without this, the bundler attempts to trace a native `.node` binary and the failure surfaces at runtime rather than at build time.

- [ ] **Step 2: Write `current-user.ts`**

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@cs/db";
import { parseServerEnv } from "@cs/shared";
import { validateSessionToken, type SessionUser } from "./session";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const env = parseServerEnv(process.env);
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(prisma, token);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
```

- [ ] **Step 3: Write `middleware.ts`**

```typescript
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();

  const cookieName = process.env.SESSION_COOKIE_NAME ?? "cs_session";
  if (!request.cookies.has(cookieName)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
```

The middleware only checks that a cookie is present. It deliberately does not validate the session, because middleware runs in the Edge runtime where Prisma cannot open a database connection. Real validation happens in `requireUser()` inside the protected layout. Treating the middleware as the security boundary would be the mistake here; it is only a cheap redirect for the common case.

- [ ] **Step 4: Write the sign-in server action**

```typescript
// apps/web/src/app/login/actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@cs/db";
import { hashPassword, parseServerEnv, verifyPassword } from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import { createSession, invalidateSession } from "@/lib/auth/session";

const credentials = z.object({
  email: z.string().trim().toLowerCase().min(3).max(320),
  password: z.string().min(1).max(1024),
});

export type SignInState = { error: string | null };

// Hashing a throwaway password when the account does not exist keeps the
// response time constant, so the form cannot be used to enumerate accounts.
const DUMMY_HASH_PROMISE = hashPassword("account-enumeration-guard");

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const env = parseServerEnv(process.env);
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: "Enter your email address and password." };

  const correlationId = randomUUID();
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (!user || !user.isActive) {
    await verifyPassword(await DUMMY_HASH_PROMISE, parsed.data.password);
    await recordAudit(prisma, {
      correlationId,
      actorUserId: null,
      actorLabel: parsed.data.email,
      action: "user.sign_in_failed",
      entityType: "User",
      entityId: parsed.data.email,
      metadata: { reason: "unknown_or_inactive" },
    });
    return { error: "Those credentials are not valid." };
  }

  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    await recordAudit(prisma, {
      correlationId,
      actorUserId: user.id,
      actorLabel: user.email,
      action: "user.sign_in_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "bad_password" },
    });
    return { error: "Those credentials are not valid." };
  }

  const { token, expiresAt } = await createSession(prisma, {
    userId: user.id,
    ttlHours: env.SESSION_TTL_HOURS,
  });

  await recordAudit(prisma, {
    correlationId,
    actorUserId: user.id,
    actorLabel: user.email,
    action: "user.signed_in",
    entityType: "User",
    entityId: user.id,
  });

  (await cookies()).set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
    expires: expiresAt,
  });

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const env = parseServerEnv(process.env);
  const store = await cookies();
  const token = store.get(env.SESSION_COOKIE_NAME)?.value;

  if (token) await invalidateSession(prisma, token);
  store.delete(env.SESSION_COOKIE_NAME);

  redirect("/login");
}
```

Both failure branches return the same message, so the form never reveals whether an address is registered. Both are audited, which is what makes a brute-force attempt visible later.

- [ ] **Step 5: Write the login page**

```tsx
// apps/web/src/app/login/page.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900">CS Automation</h1>
          <p className="text-sm text-slate-500">Sign in with your work account.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-600">
          {state.error ?? ""}
        </p>

        <SubmitButton />
      </form>
    </main>
  );
}
```

The error paragraph reserves its height whether or not a message is present, so submitting an invalid password does not shift the button downward under the user's cursor.

- [ ] **Step 6: Write the protected layout, dashboard, loading, and error states**

```tsx
// apps/web/src/app/(app)/layout.tsx
import { requireUser } from "@/lib/auth/current-user";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <span className="text-sm font-semibold text-slate-900">CS Automation</span>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            {user.displayName} ({user.role === "CS_LEAD" ? "Lead" : "Executive"})
          </span>
          <form action={signOut}>
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-1">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded bg-slate-200" />
    </div>
  );
}
```

```tsx
// apps/web/src/app/(app)/error.tsx
"use client";

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-sm font-semibold text-red-900">Something went wrong</h2>
      <p className="mt-1 text-sm text-red-700">
        The page could not be loaded. If this keeps happening, contact the CS lead.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md border border-red-300 px-3 py-1 text-sm text-red-900"
      >
        Try again
      </button>
    </div>
  );
}
```

The error component does not render `error.message`, because an unhandled database error would otherwise print connection details to the browser.

```tsx
// apps/web/src/app/(app)/dashboard/page.tsx
import { requireUser } from "@/lib/auth/current-user";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Signed in as {user.email}</p>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-sm font-medium text-slate-900">No orders yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Order intake arrives in the next phase. Until then this dashboard confirms that
          authentication, roles, and the audit trail are working.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Redirect the root route**

```tsx
// apps/web/src/app/page.tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 8: Verify the flow manually**

```powershell
$env:SEED_ADMIN_EMAIL = "lead@yourcompany.com"
$env:SEED_ADMIN_PASSWORD = "a-strong-passphrase"
npm run db:seed
npm run dev --workspace @cs/web
```

Check each of these:

- Visiting `/dashboard` while signed out redirects to `/login`.
- Submitting a wrong password shows "Those credentials are not valid." and the layout does not shift.
- Submitting correct credentials lands on `/dashboard` showing the display name and Lead role.
- The session cookie is `HttpOnly` and `SameSite=Lax` in browser dev tools, and its value does not appear anywhere in the `Session` table.
- Signing out returns to `/login`, and going back in the browser does not restore the dashboard.
- `SELECT action, actor_label FROM "AuditEvent" ORDER BY "occurredAt";` shows one `user.sign_in_failed` and one `user.signed_in`.

- [ ] **Step 9: Commit**

```powershell
npm run verify
git add .
git commit -m "feat(web): add login, protected layout, and dashboard shell"
```

---

### Task 9: Continuous integration

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the `verify` scripts defined in Task 2 and the migrations from Task 5.
- Produces: a required status check on pull requests into `develop` and `main`.

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

jobs:
  verify:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: cs_app
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: cs_automation_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://cs_app:postgres@localhost:5432/cs_automation_test
      NODE_ENV: test
      INGEST_HMAC_SECRET: 0123456789abcdef0123456789abcdef
      BACKUP_ROOT_UNC: '\\ci-host\Production\Backup'
      PRODUCTION_ROOT_UNC: '\\ci-host\Production\Live'
      STAGING_ROOT: /tmp/cs-staging

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - run: npm run db:generate

      - run: npm run db:migrate:deploy

      - run: npm run typecheck

      - run: npm run lint

      - run: npm run format:check

      - run: npm test

      - run: npm run build
```

The steps are listed individually rather than chained through the `verify` script so that a failure names the stage that broke.

- [ ] **Step 2: Push and confirm the workflow runs green**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck, lint, format, test, and build pipeline"
git push -u origin feature/project-foundation
```

Expected: all steps pass. If `db:migrate:deploy` fails on the append-only trigger, confirm the `CREATE OR REPLACE FUNCTION` block was committed inside the migration file rather than applied manually to the local database.

- [ ] **Step 3: Protect the branches**

In GitHub repository settings, require the `verify` check to pass before merging into `develop` and `main`.

---

### Task 10: SMB copy-strategy benchmark spike

**Files:**

- Create: `scripts/spike-copy-benchmark.ps1`
- Create: `docs/benchmarks/2026-07-26-smb-copy-strategy.md`

**Interfaces:**

- Consumes: nothing from earlier tasks; it is a standalone measurement.
- Produces: a documented decision on whether the File Agent should use `Copy-Item` or `robocopy` for the backup-to-production step, which Phase 2 depends on.

The question is real rather than academic. Both roots live on the same share on `192.168.0.15`, so Windows may satisfy the copy server-side rather than pulling several gigabytes down to the workstation and pushing them back. For a 5 GB order that is the difference between seconds and minutes.

- [ ] **Step 1: Write the benchmark script**

```powershell
<#
.SYNOPSIS
  Compares Copy-Item and robocopy for a backup-to-production transfer.
.NOTES
  Refuses to run outside the designated test roots.
#>
[CmdletBinding()]
param(
  [string]$BackupRoot = '\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test',
  [string]$ProductionRoot = '\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test',
  [int]$FileCount = 10,
  [int]$FileSizeMB = 200
)

$ErrorActionPreference = 'Stop'

foreach ($root in @($BackupRoot, $ProductionRoot)) {
  if ($root -notmatch '_Software Test') {
    throw "Refusing to run: '$root' is not a designated test root."
  }
  if (-not (Test-Path -LiteralPath $root)) {
    throw "Root not reachable: $root"
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$source = Join-Path $BackupRoot "_BENCH_$stamp"
$destCopyItem = Join-Path $ProductionRoot "_BENCH_${stamp}_copyitem"
$destRobocopy = Join-Path $ProductionRoot "_BENCH_${stamp}_robocopy"

Write-Host "Creating $FileCount x ${FileSizeMB}MB test files in $source"
New-Item -ItemType Directory -Path $source -Force | Out-Null

$buffer = New-Object byte[] (1MB)
(New-Object Random).NextBytes($buffer)
for ($i = 1; $i -le $FileCount; $i++) {
  $path = Join-Path $source ("bench_{0:D3}.bin" -f $i)
  $stream = [System.IO.File]::Create($path)
  try { for ($m = 0; $m -lt $FileSizeMB; $m++) { $stream.Write($buffer, 0, $buffer.Length) } }
  finally { $stream.Dispose() }
}

$totalMB = $FileCount * $FileSizeMB

Write-Host 'Measuring Copy-Item'
$copyItem = Measure-Command {
  Copy-Item -LiteralPath $source -Destination $destCopyItem -Recurse -Force
}

Write-Host 'Measuring robocopy'
$robocopy = Measure-Command {
  robocopy $source $destRobocopy /E /R:2 /W:5 /NFL /NDL /NJH /NJS /NP | Out-Null
}

[pscustomobject]@{
  TotalMB           = $totalMB
  CopyItemSeconds   = [math]::Round($copyItem.TotalSeconds, 2)
  CopyItemMBps      = [math]::Round($totalMB / $copyItem.TotalSeconds, 1)
  RobocopySeconds   = [math]::Round($robocopy.TotalSeconds, 2)
  RobocopyMBps      = [math]::Round($totalMB / $robocopy.TotalSeconds, 1)
} | Format-List

Write-Host ''
Write-Host 'Clean up when finished:'
Write-Host "  Remove-Item -LiteralPath '$source' -Recurse -Force"
Write-Host "  Remove-Item -LiteralPath '$destCopyItem' -Recurse -Force"
Write-Host "  Remove-Item -LiteralPath '$destRobocopy' -Recurse -Force"
```

Cleanup is printed rather than executed, because a script that recursively deletes folders on a production file server should require a human to press the key.

- [ ] **Step 2: Run the benchmark**

```powershell
pwsh -File scripts/spike-copy-benchmark.ps1 -FileCount 10 -FileSizeMB 200
```

Expected: a table of throughput for both methods over 2 GB. Run it outside business hours; it writes 2 GB and reads 4 GB across the LAN.

- [ ] **Step 3: Record the result**

Write `docs/benchmarks/2026-07-26-smb-copy-strategy.md` with the measured numbers, the date and time of the run, and a recommendation. Interpret it as follows: if `Copy-Item` is more than roughly twice as fast, Windows is performing a server-side copy and Phase 2 should use it with robocopy kept only as the retry path; if the two are comparable, the bytes are round-tripping and robocopy wins for its restartable mode and retry semantics.

- [ ] **Step 4: Run the cleanup commands the script printed, then commit**

```powershell
git add scripts/spike-copy-benchmark.ps1 docs/benchmarks/
git commit -m "spike: benchmark SMB copy strategy for backup to production transfer"
```

---

### Task 11: Final verification and Phase 0 sign-off

**Files:**

- Modify: `docs/implementation-status.md`, `docs/unresolved-questions.md`, `README.md`

- [ ] **Step 1: Run the full verification from a clean install**

```powershell
Remove-Item -Recurse -Force node_modules, apps/web/node_modules, packages/*/node_modules -ErrorAction SilentlyContinue
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run verify
```

Expected: typecheck, lint, format check, all tests, and build pass. Record the actual test count.

- [ ] **Step 2: Confirm no secrets were committed**

```powershell
git log --all -p | Select-String -Pattern "INGEST_HMAC_SECRET=", "PASSWORD=", "BEGIN PRIVATE KEY" | Select-Object -First 20
git ls-files | Select-String -Pattern "^\.env$"
```

Expected: no matches other than the placeholder text inside `.env.example`.

- [ ] **Step 3: Update the documentation**

Mark Phase 0 complete in `docs/implementation-status.md` with the date and the verification results. Move anything resolved out of `docs/unresolved-questions.md` and confirm these remain open: the UNC service account, Pixofix API availability, Dropbox and Drive credentials, the Google Sheets cutover, HTTPS for the web app, and the `qwen3:4b` versus `qwen3:8b` decision.

- [ ] **Step 4: Open the pull request**

```powershell
git push
gh pr create --base develop --head feature/project-foundation --title "Phase 0: project foundation" --body "Monorepo, validated configuration, PostgreSQL schema with append-only audit, session authentication with role separation, app shell, CI, and the SMB copy benchmark."
```

- [ ] **Step 5: Write the implementation report**

Report against the governance template: Completed, Changed files, Architecture and data decisions, Database changes, Tests added, Commands executed, Results, Pending work, Known limitations, Risks, Assumptions, and Scope confirmation. State explicitly that no file operations, Gmail integration, AI calls, or order business logic were implemented, since those belong to later phases.

---

## Known limitations of Phase 0

- The app runs over plain HTTP on the LAN, so `SESSION_COOKIE_SECURE` is false and session cookies traverse the network unencrypted. HTTPS is required before this handles anything beyond internal traffic. Tracked in ADR 0004 and `docs/risks.md`.
- One PostgreSQL role, `cs_app`, both owns the schema and serves runtime traffic. Splitting migration and runtime privileges is deferred.
- `fileParallelism` is disabled in Vitest because integration tests share one database. If the suite becomes slow, move to per-worker schemas rather than re-enabling parallelism blindly.
- There is no rate limiting on the login form yet. Failed attempts are audited, so abuse is visible, but not blocked. Add this alongside the ingest endpoint in Phase 3.
