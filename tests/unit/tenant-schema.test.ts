import { describe, it, expect } from "vitest";
import {
  generalSettingsSchema,
  inviteMemberSchema,
} from "@/modules/tenant/schema";

describe("generalSettingsSchema", () => {
  it("accetta impostazioni valide", () => {
    const r = generalSettingsSchema.safeParse({
      name: "Acme",
      timezone: "Europe/Rome",
      currency: "EUR",
      locale: "it-IT",
    });
    expect(r.success).toBe(true);
  });
  it("rifiuta nome troppo corto", () => {
    const r = generalSettingsSchema.safeParse({
      name: "A",
      timezone: "Europe/Rome",
      currency: "EUR",
      locale: "it-IT",
    });
    expect(r.success).toBe(false);
  });
});

describe("inviteMemberSchema", () => {
  it("accetta ruoli consentiti", () => {
    expect(inviteMemberSchema.safeParse({ email: "a@b.it", role: "admin" }).success).toBe(true);
  });
  it("rifiuta ruolo 'owner' (non assegnabile via invito)", () => {
    expect(inviteMemberSchema.safeParse({ email: "a@b.it", role: "owner" }).success).toBe(false);
  });
});
