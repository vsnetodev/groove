import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setLoading(false);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return { session, user: session?.user ?? null, loading };
}

export type AppRole = "admin" | "moderator" | "organizer" | "user";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  moderator: "Moderador",
  organizer: "Produtor",
  user: "Participante",
};

export function useRoles() {
  const { user, loading } = useSession();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [checked, setChecked] = useState(false);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setRoles([]);
      setChecked(!loading);
      return;
    }
    let active = true;
    setChecked(false);
    setRoles([]);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (!active) return;
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [userId, loading]);

  const isAdmin = roles.includes("admin");
  const isModerator = roles.includes("moderator");
  const isProducer = roles.includes("organizer");
  return {
    user,
    roles,
    checked,
    isAdmin,
    isModerator,
    isProducer,
    isStaff: isAdmin || isModerator || isProducer,
    primaryRole: (isAdmin
      ? "admin"
      : isModerator
        ? "moderator"
        : isProducer
          ? "organizer"
          : "user") as AppRole,
  };
}

export function useIsStaff() {
  const { isStaff, checked, user } = useRoles();
  return { isStaff, checked, user };
}
