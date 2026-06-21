"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "./useSupabase";

export function useUser() {
  const supabase = useSupabase();

  return useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    staleTime: 5 * 60 * 1000,
  });
}
