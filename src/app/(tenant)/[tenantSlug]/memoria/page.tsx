import type { Metadata } from "next";
import { Brain } from "lucide-react";
import { isDemoMode } from "@/config/demo";
import { hasGeneration, hasRealEmbeddings } from "@/lib/rag/config";
import { requireTenant } from "@/lib/tenant/context";
import { Badge } from "@/components/ui/badge";
import { ChatPanel } from "@/modules/rag/components/ChatPanel";
import { IndexStatusCard } from "@/modules/rag/components/IndexStatusCard";
import { MemoryPanel } from "@/modules/rag/components/MemoryPanel";
import {
  getIndexOverview,
  getMemories,
  getPendingIndexCount,
  getRagSettings,
} from "@/modules/rag/queries";

export const metadata: Metadata = { title: "Memoria" };

export default async function MemoriaPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await requireTenant();
  const demo = isDemoMode();

  const [settings, overview, pending, memories] = await Promise.all([
    getRagSettings(),
    getIndexOverview(),
    getPendingIndexCount(),
    getMemories(),
  ]);

  const warnings: string[] = [];
  if (!hasGeneration()) {
    warnings.push(
      "ANTHROPIC_API_KEY non configurata: le risposte mostrano gli estratti trovati, senza sintesi.",
    );
  }
  if (!hasRealEmbeddings()) {
    warnings.push(
      "VOYAGE_API_KEY non configurata: la ricerca usa embedding locali e il full-text italiano, con meno precisione semantica.",
    );
  }
  if (demo) {
    warnings.push("Modalità demo: archivio di esempio, nessun dato reale viene letto o scritto.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Brain className="size-6" />
            Memoria aziendale
          </h1>
          <p className="text-muted-foreground text-sm">
            Tutto ciò che {tenant.name} ha registrato, interrogabile in linguaggio naturale — con
            le fonti sempre citate.
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          {settings.assistant_name}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="bg-card flex min-h-[32rem] flex-col rounded-lg border p-4 lg:h-[calc(100vh-14rem)]">
          <ChatPanel
            tenantSlug={tenantSlug}
            initialMessages={[]}
            initialConversationId={null}
            demo={demo}
          />
        </div>

        <aside className="space-y-4">
          <IndexStatusCard
            overview={overview}
            pending={pending}
            readOnly={demo}
            warnings={warnings}
          />
          <MemoryPanel memories={memories} readOnly={demo} />
        </aside>
      </div>
    </div>
  );
}
