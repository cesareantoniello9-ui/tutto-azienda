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
import { LoginForm } from "@/modules/auth/components/LoginForm";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Accedi</CardTitle>
        <CardDescription>
          Inserisci le tue credenziali per accedere all&apos;area riservata.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm />
        <div className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-primary hover:underline"
          >
            Password dimenticata?
          </Link>
        </div>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Non hai un account?
        <Link href="/register" className="ml-1 font-medium text-primary hover:underline">
          Registrati
        </Link>
      </CardFooter>
    </Card>
  );
}
