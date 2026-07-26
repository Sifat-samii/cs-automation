import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth/current-user";

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
