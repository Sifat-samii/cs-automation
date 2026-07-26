import { signOut } from "@/app/login/actions";
import Link from "next/link";
import { SubmitButton } from "@/app/(app)/_components/submit-button";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="font-bold tracking-tight text-slate-950">
              CS Automation
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-slate-600">
              <Link
                href="/orders"
                className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-950"
              >
                Orders
              </Link>
              {can(user.role, "client:manage") && (
                <Link
                  href="/clients"
                  className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-950"
                >
                  Clients
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">
              {user.displayName} · {user.role === "CS_LEAD" ? "Lead" : "Executive"}
            </span>
            <form action={signOut}>
              <SubmitButton
                label="Sign out"
                pendingLabel="Signing out..."
                className="border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100"
              />
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-5 lg:p-8">{children}</main>
    </div>
  );
}
