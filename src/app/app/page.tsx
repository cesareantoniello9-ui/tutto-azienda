import { redirect } from "next/navigation";
import { getUserPrimaryTenantSlug } from "@/lib/auth";

// Punto di ingresso post-login: smista l'utente verso la propria azienda
// oppure verso l'onboarding se non ne ha ancora una.
export default async function AppEntryPage() {
  const slug = await getUserPrimaryTenantSlug();
  redirect(slug ? `/${slug}/dashboard` : "/onboarding");
}
