import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Bot,
  FileText,
  FormInput,
  Globe2,
  Home,
  Plug,
  Rocket,
  Settings,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { MobileNav } from "@/components/admin/MobileNav";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/blogs", label: "Blogs", icon: Globe2 },
  { href: "/articles", label: "Articles", icon: FileText },
  { href: "/funnels", label: "Funnels", icon: FormInput },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/mcp", label: "MCP", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="app-grid">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div className="brand-copy">
            <strong>AEO Machine</strong>
            <span>Micro-blog control</span>
          </div>
        </div>
        <nav className="nav-list">
          {nav.map((item) => (
            <Link key={item.href} className="nav-link" href={item.href}>
              <item.icon size={17} />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="button-row">
            <BarChart3 size={18} />
            <strong>Operational admin</strong>
          </div>
          <div className="button-row">
            <span className="muted">{user.email}</span>
            <LogoutButton />
          </div>
        </header>
        <div className="content-wrap">{children}</div>
      </div>
      <MobileNav items={nav.slice(0, 5)} />
    </div>
  );
}
