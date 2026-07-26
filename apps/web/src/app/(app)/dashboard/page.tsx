import { requireUser } from "@/lib/auth/current-user";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Signed in with ID {user.loginId}</p>
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
