export const packageName = "@cs/shared";
export { serverEnvSchema, parseServerEnv, EnvValidationError } from "./env.js";
export type { ServerEnv } from "./env.js";
export { signRequest, verifyRequest } from "./hmac.js";
export type { VerifyResult } from "./hmac.js";
export { hashPassword, verifyPassword } from "./password.js";
export {
  PathBudgetError,
  PathTraversalError,
  assertPathBudget,
  buildOrderCode,
  buildOrderFolderName,
  joinUncPath,
  sanitisePathSegment,
  toExtendedLengthPath,
} from "./paths.js";
export {
  BATCH_STATUSES,
  ORDER_STATUSES,
  IllegalTransitionError,
  assertBatchTransition,
  assertOrderTransition,
  batchTransition,
  orderTransition,
} from "./lifecycle.js";
export type { BatchStatus, OrderStatus } from "./lifecycle.js";
export { allocateUniqueClientCode, deriveClientCode } from "./client-code.js";
