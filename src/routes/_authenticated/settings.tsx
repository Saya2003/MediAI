import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { User, Bell, LogOut, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings · MediFlow" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState<string>(
    (user?.user_metadata?.full_name as string) ?? "",
  );
  const [emailMe, setEmailMe] = useState(true);
  const [pushMe, setPushMe] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveProfile() {
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-4xl">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Update your profile, choose how we reach you, and manage your account.
      </p>

      <section className="surface-card mt-6 p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <User className="h-5 w-5 text-primary" /> Your profile
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={user?.email ?? ""} disabled />
          </Field>
          <Field label="Role">
            <Input value="Care coordinator" disabled />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </section>

      <section className="surface-card mt-6 p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Bell className="h-5 w-5 text-primary" /> How we reach you
        </h2>
        <div className="mt-4 space-y-4">
          <ToggleRow
            title="Email me about new to-dos"
            desc="We'll send a short email when something needs your attention."
            checked={emailMe}
            onChange={setEmailMe}
          />
          <ToggleRow
            title="Send phone alerts"
            desc="Get a push notification when a case is past its deadline."
            checked={pushMe}
            onChange={setPushMe}
          />
        </div>
      </section>

      <section className="surface-card mt-6 p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Shield className="h-5 w-5 text-primary" /> Account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Log out of this device. You can sign back in any time.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
