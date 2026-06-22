import { z } from "zod";

const optionalText = z.string().trim().max(200).optional();

/** Validazione del form cliente (create + update). */
export const clientFormSchema = z.object({
  type: z.enum(["company", "individual"]),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  email: z.union([z.literal(""), z.email("Email non valida")]).optional(),
  phone: optionalText,
  vat_number: optionalText,
  tax_code: optionalText,
  website: optionalText,
  industry: optionalText,
  address_city: optionalText,
  address_province: z.string().trim().max(4).optional(),
  is_active: z.boolean(),
  notes: z.string().trim().max(2000).optional(),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;
