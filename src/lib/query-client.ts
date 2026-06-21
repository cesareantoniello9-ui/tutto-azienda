import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,      // 1 minuto
        gcTime: 5 * 60 * 1000,     // 5 minuti
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: crea sempre un client nuovo (non condiviso tra richieste)
    return makeQueryClient();
  }
  // Browser: riusa l'istanza esistente
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
