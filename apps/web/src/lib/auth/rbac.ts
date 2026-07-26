import type { UserRole } from "@cs/db";

export type Permission = "user:manage" | "audit:read" | "client:manage" | "order:write";

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  CS_EXECUTIVE: ["order:write"],
  CS_LEAD: ["user:manage", "audit:read", "client:manage", "order:write"],
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
