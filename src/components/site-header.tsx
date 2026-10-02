import { Link, useRouter } from "@tanstack/react-router";
import { Menu, Ticket, ShieldCheck, LogOut, User as UserIcon } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { useRoles, useSession, ROLE_LABEL } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function SiteHeader() {
  const { user } = useSession();
  const { isStaff, isAdmin, primaryRole } = useRoles();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Você saiu");
    router.navigate({ to: "/", replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative h-10 w-10 overflow-hidden rounded-full ring-1 ring-primary/40 group-hover:ring-primary transition group-hover:glow-primary">
            <img src={logoUrl} alt="Clube Groove" className="h-full w-full object-cover" />
          </div>
          <span className="display text-2xl leading-none tracking-wide">
            <span className="text-gradient-primary">CLUBE</span>{" "}
            <span className="text-gradient-flame">GROOVE</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <Link
            to="/"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
            activeOptions={{ exact: true }}
            activeProps={{ className: "!text-foreground" }}
          >
            Eventos
          </Link>
          {user && (
            <Link
              to="/my-tickets"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
              activeProps={{ className: "!text-foreground" }}
            >
              Meus ingressos
            </Link>
          )}
          {isStaff && (
            <Link
              to="/admin"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
              activeProps={{ className: "!text-foreground" }}
            >
              Painel
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline max-w-32 truncate">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs font-medium text-primary">{ROLE_LABEL[primaryRole]}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/my-tickets" className="cursor-pointer">
                    <Ticket className="mr-2 h-4 w-4" />
                    Meus ingressos
                  </Link>
                </DropdownMenuItem>
                {isStaff && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="cursor-pointer">
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Painel do {ROLE_LABEL[primaryRole].toLowerCase()}
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin/users" className="cursor-pointer">
                      <UserIcon className="mr-2 h-4 w-4" />
                      Usuários
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button
                size="sm"
                className="bg-gradient-to-r from-primary to-primary/80 hover:opacity-90"
              >
                Entrar
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
