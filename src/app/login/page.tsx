import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18 }}>
      <section className="panel panel-pad" style={{ width: "100%", maxWidth: 420 }}>
        <div className="brand-lockup" style={{ paddingLeft: 0 }}>
          <div className="brand-mark">A</div>
          <div className="brand-copy">
            <strong>AEO Machine</strong>
            <span>Admin login</span>
          </div>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
