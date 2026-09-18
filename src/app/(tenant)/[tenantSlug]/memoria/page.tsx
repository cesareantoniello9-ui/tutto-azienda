import type { Metadata } from "next";
import { Brain } from "lucide-react";
import { isDemoMode } from "@/config/demo";
import { hasGeneration, hasRealEmbeddings } from "@/lib/rag/config";
import { requireTenant } from "@/lib/tenant/context";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/modules/rag/components/ChatPanel";
import { DailyRecapCard } from "@/modules/rag/components/DailyRecapCard";
import { EvalPanel, type EvalRunSummary } from "@/modules/rag/components/EvalPanel";
import { FilesPanel } from "@/modules/rag/components/FilesPanel";
import { IndexStatusCard } from "@/modules/rag/components/IndexStatusCard";
import { MemoryPanel } from "@/modules/rag/components/MemoryPanel";
import {
  getDailyRecaps,
  getEvalCases,
  getEvalRuns,
  getFiles,
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

  const [settings, overview, pending, memories, recaps, files, evalCases, evalRuns] =
    await Promise.all([
      getRagSettings(),
      getIndexOverview(),
      getPendingIndexCount(),
      getMemories(),
      getDailyRecaps(),
      getFiles(),
      getEvalCases(),
      getEvalRuns(),
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
            Tutto ciò che {tenant.name} ha registrato — dati, allegati, email e la giornata di
            lavoro — interrogabile in linguaggio naturale, con le fonti sempre citate.
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          {settings.assistant_name}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="bg-card flex min-h-[32rem] flex-col rounded-lg border p-4 lg:h-[calc(100vh-14rem)]">
          <ChatPanel
            tenantSlug={tenantSlug}
            initialMessages={[]}
            initialConversationId={null}
            demo={demo}
          />
        </div>

        <aside>
          <Tabs defaultValue="oggi">
            <TabsList className="w-full">
              <TabsTrigger value="oggi" className="flex-1">
                Oggi
              </TabsTrigger>
              <TabsTrigger value="fonti" className="flex-1">
                Fonti
              </TabsTrigger>
              <TabsTrigger value="memoriale" className="flex-1">
                Memoriale
              </TabsTrigger>
              <TabsTrigger value="qualita" className="flex-1">
                Qualità
              </TabsTrigger>
            </TabsList>

            <TabsContent value="oggi" className="mt-4">
              <DailyRecapCard recaps={recaps} readOnly={demo} />
            </TabsContent>

            <TabsContent value="fonti" className="mt-4 space-y-4">
              <IndexStatusCard
                overview={overview}
                pending={pending}
                readOnly={demo}
                warnings={warnings}
              />
              <FilesPanel files={files} readOnly={demo} />
            </TabsContent>

            <TabsContent value="memoriale" className="mt-4">
              <MemoryPanel memories={memories} readOnly={demo} />
            </TabsContent>

            <TabsContent value="qualita" className="mt-4">
              <EvalPanel
                cases={evalCases}
                runs={evalRuns as EvalRunSummary[]}
                readOnly={demo}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
