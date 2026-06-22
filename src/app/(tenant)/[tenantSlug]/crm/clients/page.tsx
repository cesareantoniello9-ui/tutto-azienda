import type { Metadata } from "next";
import { clientsService } from "@/services/crm/clients.service";
import { ClientsView } from "@/modules/crm/clients/components/ClientsView";

export const metadata: Metadata = { title: "Clienti" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const result = await clientsService.findAll({
    search: q ?? "",
    page: 1,
    pageSize: 50,
    sortBy: "name",
    sortDir: "asc",
  });

  return <ClientsView clients={result.rows} total={result.total} />;
}
