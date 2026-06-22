"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import type { Client } from "@/types/crm";
import { deleteClientAction } from "../actions";
import { SearchBar } from "./SearchBar";
import { ClientsTable } from "./ClientsTable";
import { ClientForm } from "./ClientForm";
import { ClientDetailsDialog } from "./ClientDetailsDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function ClientsView({ clients, total }: { clients: Client[]; total: number }) {
  const router = useRouter();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsClient, setDetailsClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(client: Client) {
    setDetailsOpen(false);
    setEditing(client);
    setFormOpen(true);
  }
  function openDetails(client: Client) {
    setDetailsClient(client);
    setDetailsOpen(true);
  }
  function askDelete(client: Client) {
    setDetailsOpen(false);
    setDeleting(client);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    const res = await deleteClientAction(deleting.id);
    setDeletePending(false);
    if (res.ok) {
      toast.success("Cliente eliminato");
      setDeleting(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clienti</h1>
          <p className="text-muted-foreground text-sm">
            {total} {total === 1 ? "cliente" : "clienti"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Aggiungi cliente
        </Button>
      </div>

      <SearchBar />

      <ClientsTable
        clients={clients}
        onView={openDetails}
        onEdit={openEdit}
        onDelete={askDelete}
      />

      <ClientForm open={formOpen} onOpenChange={setFormOpen} client={editing} />

      <ClientDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        client={detailsClient}
        onEdit={openEdit}
        onDelete={askDelete}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.name}» verrà eliminato definitivamente, insieme a opportunità,
              preventivi, attività e note collegate. L&apos;azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Annulla</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletePending}>
              {deletePending && <Loader2 className="size-4 animate-spin" />}
              Elimina
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
