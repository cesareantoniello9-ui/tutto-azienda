"use client";

import { useState, type ReactNode } from "react";
import { Building2, Menu } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationsMenu } from "@/components/dashboard/NotificationsMenu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function DashboardShell({
  tenantSlug,
  tenantName,
  userEmail,
  children,
}: {
  tenantSlug: string;
  tenantName: string;
  userEmail: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const brand = (
    <div className="flex h-14 items-center gap-2 border-b px-4 font-bold">
      <Building2 className="size-5 text-primary" />
      <span className="truncate">{tenantName}</span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="bg-sidebar hidden w-64 flex-col border-r md:flex">
        {brand}
        <SidebarNav tenantSlug={tenantSlug} />
      </aside>

      {/* Sidebar mobile (Sheet) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu di navigazione</SheetTitle>
          </SheetHeader>
          {brand}
          <div onClick={() => setOpen(false)}>
            <SidebarNav tenantSlug={tenantSlug} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <span className="text-sm text-muted-foreground md:hidden">{tenantName}</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsMenu />
            <ThemeToggle />
            <UserMenu email={userEmail} tenantSlug={tenantSlug} />
          </div>
        </header>

        <main className="flex-1 bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
