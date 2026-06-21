"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export function SettingsNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();

  const items = [
    { label: "Generale", href: `/${tenantSlug}/settings/general` },
    { label: "Membri", href: `/${tenantSlug}/settings/members` },
    { label: "Fatturazione", href: `/${tenantSlug}/settings/billing` },
  ];

  return (
    <nav className="flex gap-1 border-b">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
