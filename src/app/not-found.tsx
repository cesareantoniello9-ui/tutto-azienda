import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-7xl font-bold tracking-tight text-muted-foreground/40">404</p>
      <h1 className="text-2xl font-semibold">Pagina non trovata</h1>
      <p className="max-w-md text-muted-foreground">
        La pagina che cerchi non esiste o è stata spostata.
      </p>
      <Button asChild>
        <Link href="/">Torna alla home</Link>
      </Button>
    </div>
  );
}
