"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  unread: boolean;
};

const INITIAL: Notification[] = [
  {
    id: "1",
    title: "Nuovo membro nel team",
    description: "Giulia Rossi ha accettato l'invito.",
    time: "5 min fa",
    unread: true,
  },
  {
    id: "2",
    title: "Pagamento ricevuto",
    description: "Fattura #1042 saldata — € 1.250,00.",
    time: "1 ora fa",
    unread: true,
  },
  {
    id: "3",
    title: "Backup completato",
    description: "Il backup giornaliero è andato a buon fine.",
    time: "Ieri",
    unread: false,
  },
];

export function NotificationsMenu() {
  const [items, setItems] = useState<Notification[]>(INITIAL);
  const unreadCount = items.filter((n) => n.unread).length;

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifiche">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifiche</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Check className="size-3" />
              Segna tutte come lette
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.map((n) => (
            <div
              key={n.id}
              className="flex gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/50"
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  n.unread ? "bg-primary" : "bg-transparent"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
