import Link from "next/link";
import { ClientForm } from "@/app/(app)/clients/client-form";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";

export default async function NewClientPage() {
  const user = await requireUser();
  assertCan(user.role, "client:manage");

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
          Registers the client and creates their folder on the backup and production shares when it
          does not already exist. Order folders are created under that client folder during file
          transfer.
        </p>
      </div>
      <ClientForm />
    </div>
  );
}
