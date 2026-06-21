import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  onboardingSchema,
  updatePasswordSchema,
} from "@/modules/auth/schema";

describe("loginSchema", () => {
  it("accetta credenziali valide", () => {
    expect(loginSchema.safeParse({ email: "a@b.it", password: "12345678" }).success).toBe(true);
  });
  it("rifiuta email non valida", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "12345678" }).success).toBe(false);
  });
  it("rifiuta password corta", () => {
    expect(loginSchema.safeParse({ email: "a@b.it", password: "123" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("richiede il nome azienda", () => {
    const r = registerSchema.safeParse({ companyName: "A", email: "a@b.it", password: "12345678" });
    expect(r.success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("rifiuta slug con spazi/maiuscole", () => {
    expect(onboardingSchema.safeParse({ name: "Acme", slug: "Acme Spa" }).success).toBe(false);
  });
  it("accetta slug valido", () => {
    expect(onboardingSchema.safeParse({ name: "Acme", slug: "acme-spa" }).success).toBe(true);
  });
});

describe("updatePasswordSchema", () => {
  it("rifiuta password non coincidenti", () => {
    expect(
      updatePasswordSchema.safeParse({ password: "12345678", confirm: "87654321" }).success
    ).toBe(false);
  });
  it("accetta password coincidenti", () => {
    expect(
      updatePasswordSchema.safeParse({ password: "12345678", confirm: "12345678" }).success
    ).toBe(true);
  });
});
