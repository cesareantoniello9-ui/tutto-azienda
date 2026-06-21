import type { Metadata } from "next";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { UpdatePasswordForm } from "@/modules/auth/components/UpdatePasswordForm";

export const metadata: Metadata = { title: "Nuova password" };

export default function UpdatePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Imposta una nuova password</CardTitle>
        <CardDescription>
          Scegli una password sicura per il tuo account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
