import { parseServerEnv } from "@cs/shared";
import Link from "next/link";
import { ClientForm } from "@/app/(app)/clients/client-form";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
import { listUnboundFolders } from "@/lib/clients/service";
import { prisma } from "@cs/db";

export default async function NewClientPage() {
  const user = await requireUser();
  assertCan(user.role, "client:manage");
  const env = parseServerEnv(process.env);
  const folders = await listUnboundFolders(prisma, env.BACKUP_ROOT_UNC);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/clients"
          className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          ← Back to clients
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">Register client</h1>
        <p className="mt-1 text-sm text-slate-600">
          Select an existing backup folder. This step records the binding; it does not create or
          rename folders.
        </p>
      </div>
      <ClientForm folders={folders} />
    </div>
  );
}
