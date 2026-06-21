import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export type ActivityItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  time: string;
};

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Attività recenti</CardTitle>
        <CardDescription>Gli ultimi eventi della tua azienda.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <item.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{item.title}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.time}
              </span>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-2 py-8 text-center text-sm text-muted-foreground">
              Nessuna attività ancora.
            </li>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}
