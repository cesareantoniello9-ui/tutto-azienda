import Link from "next/link";
import type { Metadata } from "next";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { RegisterForm } from "@/modules/auth/components/RegisterForm";

export const metadata: Metadata = { title: "Registrati" };

// Niente prerender a build-time (il form crea il client Supabase).
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Crea il tuo account</CardTitle>
        <CardDescription>
          Bastano pochi secondi per creare lo spazio di lavoro della tua azienda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Hai già un account?
        <Link href="/login" className="ml-1 font-medium text-primary hover:underline">
          Accedi
        </Link>
      </CardFooter>
    </Card>
  );
}
