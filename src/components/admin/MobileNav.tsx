import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function MobileNav({
  items,
}: {
  items: { href: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <nav className="mobile-nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <item.icon size={18} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
