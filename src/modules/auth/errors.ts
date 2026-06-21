type AuthErrorLike = { message?: string; code?: string } | null | undefined;

const MESSAGES: Record<string, string> = {
  email_address_invalid: "Indirizzo email non valido. Usa un'email reale.",
  over_email_send_rate_limit:
    "Troppe email inviate di recente. Attendi qualche minuto e riprova.",
  over_request_rate_limit: "Troppi tentativi. Attendi qualche minuto e riprova.",
  user_already_exists: "Esiste già un account con questa email. Prova ad accedere.",
  email_exists: "Esiste già un account con questa email. Prova ad accedere.",
  signup_disabled: "Le registrazioni sono al momento disabilitate.",
  invalid_credentials: "Email o password non corretti.",
  email_not_confirmed: "Email non ancora confermata. Controlla la tua casella di posta.",
  weak_password: "Password troppo debole: usa almeno 8 caratteri.",
  validation_failed: "Dati non validi. Controlla i campi e riprova.",
};

/** Traduce in italiano gli errori di Supabase Auth più comuni; altrimenti
 *  mostra il messaggio reale (così la causa non resta mai nascosta). */
export function authErrorMessage(error: AuthErrorLike): string {
  if (!error) return "Operazione non riuscita. Riprova.";
  const mapped = error.code ? MESSAGES[error.code] : undefined;
  if (mapped) return mapped;
  return error.message || "Operazione non riuscita. Riprova.";
}
