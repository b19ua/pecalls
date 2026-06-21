import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ComplianceRule = {
  id: string;
  kind: "must_say" | "must_not_say";
  text: string;
  correction: string | null;
  trigger_phrases: string[] | null;
  active: boolean;
  created_at: string;
};

export function ComplianceRulesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [kind, setKind] = useState<"must_say" | "must_not_say">("must_not_say");
  const [text, setText] = useState("");
  const [correction, setCorrection] = useState("");
  const [triggers, setTriggers] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("compliance_rules" as never)
      .select("*").order("created_at", { ascending: false });
    setRules((data ?? []) as ComplianceRule[]);
  };

  useEffect(() => { if (open) void load(); }, [open]);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const trigger_phrases = triggers.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("compliance_rules" as never).insert({
      owner_id: u.user!.id,
      kind, text: text.trim(),
      correction: correction.trim() || null,
      trigger_phrases: trigger_phrases.length ? trigger_phrases : null,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setText(""); setCorrection(""); setTriggers("");
    toast.success("Rule added");
    void load();
  };

  const toggle = async (r: ComplianceRule) => {
    await supabase.from("compliance_rules" as never).update({ active: !r.active } as never).eq("id", r.id);
    void load();
  };

  const remove = async (r: ComplianceRule) => {
    await supabase.from("compliance_rules" as never).delete().eq("id", r.id);
    toast.success("Rule deleted");
    void load();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Compliance rules
          </SheetTitle>
          <p className="text-xs text-muted-foreground">Apply to every active call. Agents are graded against these in real time.</p>
        </SheetHeader>

        <div className="px-5 py-4 border-b border-border space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={kind === "must_not_say" ? "default" : "outline"}
              onClick={() => setKind("must_not_say")}
              className={cn(kind === "must_not_say" && "bg-red-500 hover:bg-red-600 text-white")}
            >
              <ShieldX className="h-3.5 w-3.5 mr-1" /> Must not say
            </Button>
            <Button
              size="sm"
              variant={kind === "must_say" ? "default" : "outline"}
              onClick={() => setKind("must_say")}
              className={cn(kind === "must_say" && "bg-emerald-500 hover:bg-emerald-600 text-white")}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Must say
            </Button>
          </div>
          <Textarea
            placeholder={kind === "must_not_say"
              ? "Rule, e.g. Don't promise guaranteed savings"
              : "Rule, e.g. Read the call recording disclosure at the start"}
            value={text} onChange={(e) => setText(e.target.value)} rows={2}
          />
          <Input
            placeholder={kind === "must_not_say" ? "Compliant rephrase (optional)" : "Required line (optional)"}
            value={correction} onChange={(e) => setCorrection(e.target.value)}
          />
          <Input
            placeholder="Trigger phrases, comma-separated (optional)"
            value={triggers} onChange={(e) => setTriggers(e.target.value)}
          />
          <Button onClick={add} disabled={saving || !text.trim()} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add rule
          </Button>
        </div>

        <ScrollArea className="flex-1 px-5 py-3">
          {rules.length === 0 && <div className="text-xs text-muted-foreground">No rules yet.</div>}
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className={cn("rounded-lg border p-3 bg-card", !r.active && "opacity-50")}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  {r.kind === "must_not_say"
                    ? <Badge className="bg-red-500/15 text-red-400 border border-red-500/30">Must not say</Badge>
                    : <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Must say</Badge>}
                  <div className="flex items-center gap-2">
                    <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
                    <Button size="icon" variant="ghost" onClick={() => remove(r)} className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm">{r.text}</div>
                {r.correction && (
                  <div className="text-xs text-muted-foreground mt-1">
                    → {r.kind === "must_not_say" ? "Say instead: " : "Required line: "}{r.correction}
                  </div>
                )}
                {r.trigger_phrases && r.trigger_phrases.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    triggers: {r.trigger_phrases.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
