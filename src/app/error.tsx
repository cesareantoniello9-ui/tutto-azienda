"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In produzione: inviare a un servizio di error tracking (es. Sentry).
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold">Qualcosa è andato storto</h1>
      <p className="max-w-md text-muted-foreground">
        Si è verificato un errore imprevisto. Riprova; se il problema persiste,
        contatta il supporto.
      </p>
      <Button onClick={reset}>Riprova</Button>
    </div>
  );
}
