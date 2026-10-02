import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Saves the account type chosen during onboarding. The role assignment routine is
 * server-only; the acting user comes from the verified session, never from input.
 */
export const chooseAccountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ type: z.enum(["participante", "produtor"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("choose_account_type_srv", {
      p_actor: context.userId,
      p_type: data.type,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
