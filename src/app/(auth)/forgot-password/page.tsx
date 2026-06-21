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
import { ResetPasswordForm } from "@/modules/auth/components/ResetPasswordForm";

export const metadata: Metadata = { title: "Password dimenticata" };

// Niente prerender a build-time (il form crea il client Supabase).
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Password dimenticata?</CardTitle>
        <CardDescription>
          Inserisci la tua email e ti invieremo un link per reimpostarla.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Torna al login
        </Link>
      </CardFooter>
    </Card>
  );
}
