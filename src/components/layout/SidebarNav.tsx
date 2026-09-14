"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  LayoutDashboard,
  Settings,
  Users2,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  label: string;
  href: string;
  activePrefix: string;
  icon: LucideIcon;
  soon?: boolean;
};

export function SidebarNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      label: "Dashboard",
      href: `/${tenantSlug}/dashboard`,
      activePrefix: `/${tenantSlug}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      label: "CRM",
      href: `/${tenantSlug}/crm/clients`,
      activePrefix: `/${tenantSlug}/crm`,
      icon: Users2,
    },
    {
      label: "Memoria",
      href: `/${tenantSlug}/memoria`,
      activePrefix: `/${tenantSlug}/memoria`,
      icon: Brain,
    },
    {
      label: "Impostazioni",
      href: `/${tenantSlug}/settings/general`,
      activePrefix: `/${tenantSlug}/settings`,
      icon: Settings,
    },
    { label: "Magazzino", href: "#", activePrefix: " ", icon: Package, soon: true },
  ];

  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((item) => {
        const active = pathname.startsWith(item.activePrefix);
        if (item.soon) {
          return (
            <span
              key={item.label}
              className="text-muted-foreground/60 flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <item.icon className="size-4" />
                {item.label}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                Presto
              </Badge>
            </span>
          );
        }
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
