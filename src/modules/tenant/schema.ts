import { z } from "zod";

export const generalSettingsSchema = z.object({
  name: z.string().min(2, "Il nome deve avere almeno 2 caratteri").max(100),
  timezone: z.string().min(1, "Seleziona un fuso orario"),
  currency: z.string().min(1, "Seleziona una valuta"),
  locale: z.string().min(1, "Seleziona una lingua"),
});
export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;

export const inviteMemberSchema = z.object({
  email: z.email("Inserisci un'email valida"),
  role: z.enum(["admin", "member", "viewer"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
