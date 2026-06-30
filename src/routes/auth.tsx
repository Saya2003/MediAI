import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · MediFlow AI" },
      { name: "description", content: "Sign in to the MediFlow AI coordinator workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
        });
        if (error) throw error;
        
        if (!data.session) {
          toast.success("Account created successfully! Please check your email to verify your account before logging in.");
          setMode("signin");
          return;
        }
        
        toast.success("Account created. Welcome to MediFlow.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.includes("Email not confirmed")) {
            toast.error("You cannot log in because your email is not verified. Please check your inbox for the verification link.");
            return;
          }
          throw error;
        }
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 p-12 text-primary-foreground md:flex">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-2">
          <CircleDot className="h-5 w-5" />
          <span className="font-display text-2xl">MediFlow</span>
        </Link>
        <div className="relative space-y-6">
          <h1 className="font-display text-5xl leading-tight">
            Patient care that just <em className="not-italic">flows</em>.
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Every patient request, approval, and visit — all in one calm place. People and smart helpers, working as one.
          </p>
        </div>
        <p className="relative text-xs text-primary-foreground/60">Practice data · For demonstration</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Log in to pick up where you left off."
              : "We'll set you up as a care coordinator."}
          </p>

          <form onSubmit={handleEmail} className="mt-6 space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {mode === "signin" ? "Log in" : "Create my account"}
            </Button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
