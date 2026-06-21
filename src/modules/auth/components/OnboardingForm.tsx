"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import { onboardingSchema, type OnboardingInput } from "@/modules/auth/schema";
import { createTenant } from "@/modules/tenant/actions";
import { slugify } from "@/lib/utils/format";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function OnboardingForm() {
  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: "", slug: "" },
  });

  const name = form.watch("name");

  // Slug generato automaticamente dal nome finché l'utente non lo modifica.
  useEffect(() => {
    if (!form.formState.dirtyFields.slug) {
      form.setValue("slug", slugify(name), {
        shouldValidate: name.length > 1,
      });
    }
  }, [name, form]);

  async function onSubmit(values: OnboardingInput) {
    const res = await createTenant(values);
    if (res.ok) {
      toast.success("Azienda creata!");
      window.location.href = `/${res.slug}/dashboard`;
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome azienda</FormLabel>
              <FormControl>
                <Input placeholder="Acme S.r.l." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Indirizzo dello spazio di lavoro</FormLabel>
              <FormControl>
                <div className="flex items-center rounded-md border border-input pl-3 text-sm focus-within:ring-[3px] focus-within:ring-ring/50">
                  <span className="text-muted-foreground">tuttoa.com/</span>
                  <Input
                    className="border-0 shadow-none focus-visible:ring-0"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormDescription>
                Sarà l&apos;URL univoco della tua azienda.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
          Crea azienda e continua
        </Button>
      </form>
    </Form>
  );
}
