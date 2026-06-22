"use client";

import type { ComponentType } from "react";
import {
  Pencil,
  Trash2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Receipt,
  IdCard,
  Briefcase,
  type LucideProps,
} from "lucide-react";
import type { Client } from "@/types/crm";
import { formatDate } from "@/lib/utils/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="truncate text-sm">{value}</div>
      </div>
    </div>
  );
}

export function ClientDetailsDialog({
  open,
  onOpenChange,
  client,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {client && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarFallback>{client.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="truncate">{client.name}</DialogTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary">
                      {client.type === "company" ? "Azienda" : "Privato"}
                    </Badge>
                    <Badge variant={client.is_active ? "default" : "outline"}>
                      {client.is_active ? "Attivo" : "Inattivo"}
                    </Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field icon={Mail} label="Email" value={client.email} />
              <Field icon={Phone} label="Telefono" value={client.phone} />
              <Field icon={Receipt} label="P.IVA" value={client.vat_number} />
              <Field icon={IdCard} label="Codice Fiscale" value={client.tax_code} />
              <Field icon={Globe} label="Sito web" value={client.website} />
              <Field icon={Briefcase} label="Settore" value={client.industry} />
              <Field
                icon={MapPin}
                label="Città"
                value={
                  [client.address_city, client.address_province].filter(Boolean).join(" (") +
                  (client.address_province ? ")" : "")
                }
              />
            </div>

            {client.notes && (
              <>
                <Separator />
                <div>
                  <div className="text-muted-foreground mb-1 text-xs">Note</div>
                  <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
                </div>
              </>
            )}

            <p className="text-muted-foreground text-xs">
              Creato il {formatDate(client.created_at)}
            </p>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(client)}
              >
                <Trash2 className="size-4" />
                Elimina
              </Button>
              <Button onClick={() => onEdit(client)}>
                <Pencil className="size-4" />
                Modifica
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
