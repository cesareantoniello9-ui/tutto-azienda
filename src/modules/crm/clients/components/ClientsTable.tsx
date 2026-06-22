"use client";

import { MoreHorizontal, Eye, Pencil, Trash2, Users } from "lucide-react";
import type { Client } from "@/types/crm";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type RowAction = (client: Client) => void;

export function ClientsTable({
  clients,
  onView,
  onEdit,
  onDelete,
}: {
  clients: Client[];
  onView: RowAction;
  onEdit: RowAction;
  onDelete: RowAction;
}) {
  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
          <Users className="size-5" />
        </div>
        <p className="mt-3 font-medium">Nessun cliente</p>
        <p className="text-muted-foreground text-sm">
          Aggiungi il tuo primo cliente o modifica la ricerca.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Cliente</TableHead>
            <TableHead className="hidden sm:table-cell">Tipo</TableHead>
            <TableHead className="hidden md:table-cell">Telefono</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow
              key={client.id}
              className="cursor-pointer"
              onClick={() => onView(client)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarFallback>{client.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{client.name}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {client.email ?? "—"}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant="secondary">
                  {client.type === "company" ? "Azienda" : "Privato"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground hidden md:table-cell">
                {client.phone ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={client.is_active ? "default" : "outline"}>
                  {client.is_active ? "Attivo" : "Inattivo"}
                </Badge>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Azioni cliente">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(client)}>
                      <Eye className="size-4" />
                      Dettagli
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(client)}>
                      <Pencil className="size-4" />
                      Modifica
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(client)}>
                      <Trash2 className="size-4" />
                      Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
