"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Me } from "@/lib/types";

const WebUserContext = createContext<Me | null>(null);

export function useWebUser() {
  return useContext(WebUserContext);
}

export function WebAccess({ children, user }: { children: ReactNode; user: Me | null }) {
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== user?.id)) {
        window.location.replace(event === 'SIGNED_OUT' ? '/login' : '/');
      } else if (event === 'USER_UPDATED') {
        router.refresh();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, user?.id]);
  return <WebUserContext.Provider value={user}>{children}</WebUserContext.Provider>;
}
