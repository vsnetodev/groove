import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

/**
 * Após o primeiro login social, se a pessoa ainda não escolheu o tipo de conta,
 * leva para /onboarding antes de liberar o resto da plataforma.
 */
export function AccountTypeGate() {
  const { user } = useSession();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });

  const { data: chosen } = useQuery({
    queryKey: ["account-type-chosen", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("account_type_chosen")
        .eq("id", user!.id)
        .maybeSingle();
      return data?.account_type_chosen ?? true;
    },
  });

  useEffect(() => {
    if (!user || chosen === undefined) return;
    if (chosen === false && pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [user, chosen, pathname, navigate]);

  return null;
}
