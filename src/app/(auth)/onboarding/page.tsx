import type { Metadata } from "next";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { OnboardingForm } from "@/modules/auth/components/OnboardingForm";

export const metadata: Metadata = { title: "Crea la tua azienda" };

export default function OnboardingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Crea la tua azienda</CardTitle>
        <CardDescription>
          Un ultimo passo: dai un nome al tuo spazio di lavoro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingForm />
      </CardContent>
    </Card>
  );
}
