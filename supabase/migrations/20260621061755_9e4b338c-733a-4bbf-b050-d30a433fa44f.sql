
CREATE TABLE public.compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('must_say','must_not_say')),
  text text NOT NULL,
  trigger_phrases text[],
  correction text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_rules TO authenticated;
GRANT ALL ON public.compliance_rules TO service_role;

ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage their compliance rules"
  ON public.compliance_rules FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER set_updated_at_compliance_rules
  BEFORE UPDATE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_compliance_rules_owner_active ON public.compliance_rules(owner_id, active);
