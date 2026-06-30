-- Migration: Add SRS Tables for MediFlow AI
-- FULLY ENUM-FREE — all TEXT + CHECK, no ::public.app_role[] casts

-- ============================================================
-- DROP EXISTING SIGNATURES AND DEPENDENT POLICIES CLEANLY
-- ============================================================
DROP FUNCTION IF EXISTS public.current_user_has_any_role(text[]) CASCADE;
DROP FUNCTION IF EXISTS public.current_user_has_any_role(public.app_role[]) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(UUID, text) CASCADE;

-- ============================================================
-- RE-CREATE PREREQUISITE HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_has_any_role(required_roles text[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = ANY(required_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role text)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
$$;

-- ============================================================
-- RE-CREATE CORE POLICIES TO USE NEW TEXT SIGNATURES
-- ============================================================
-- CASES
DROP POLICY IF EXISTS "cases visible to staff" ON public.cases;
CREATE POLICY "cases visible to staff" ON public.cases FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor'])
  OR referring_physician_id = auth.uid()
);

DROP POLICY IF EXISTS "cases insert by staff" ON public.cases;
CREATE POLICY "cases insert by staff" ON public.cases FOR INSERT TO authenticated WITH CHECK (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician'])
);

DROP POLICY IF EXISTS "cases update by staff" ON public.cases;
CREATE POLICY "cases update by staff" ON public.cases FOR UPDATE TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor'])
);

-- REFERRALS
DROP POLICY IF EXISTS "referrals read" ON public.referrals;
CREATE POLICY "referrals read" ON public.referrals FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician'])
);

DROP POLICY IF EXISTS "referrals write" ON public.referrals;
CREATE POLICY "referrals write" ON public.referrals FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician'])
) WITH CHECK (true);

-- PRE-AUTHORIZATIONS
DROP POLICY IF EXISTS "preauth staff" ON public.pre_authorizations;
CREATE POLICY "preauth staff" ON public.pre_authorizations FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor'])
) WITH CHECK (true);

-- APPOINTMENTS
DROP POLICY IF EXISTS "appt staff" ON public.appointments;
CREATE POLICY "appt staff" ON public.appointments FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist'])
) WITH CHECK (true);

-- FOLLOW UPS
DROP POLICY IF EXISTS "followup staff" ON public.follow_ups;
CREATE POLICY "followup staff" ON public.follow_ups FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist'])
) WITH CHECK (true);

-- TASKS
DROP POLICY IF EXISTS "tasks read staff" ON public.tasks;
CREATE POLICY "tasks read staff" ON public.tasks FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist','physician'])
);

DROP POLICY IF EXISTS "tasks write staff" ON public.tasks;
CREATE POLICY "tasks write staff" ON public.tasks FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor'])
) WITH CHECK (true);

-- CASE EVENTS
DROP POLICY IF EXISTS "events read staff" ON public.case_events;
CREATE POLICY "events read staff" ON public.case_events FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist','physician'])
);

DROP POLICY IF EXISTS "events insert staff" ON public.case_events;
CREATE POLICY "events insert staff" ON public.case_events FOR INSERT TO authenticated WITH CHECK (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor'])
);

-- ============================================================
-- 1. INSURANCE POLICIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_name    TEXT NOT NULL,
  group_id        TEXT,
  coverage_tier   TEXT,
  network_specialists TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_policies_read') THEN
    CREATE POLICY "insurance_policies_read" ON public.insurance_policies FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_policies_staff_write') THEN
    CREATE POLICY "insurance_policies_staff_write" ON public.insurance_policies FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor']))
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE TRIGGER insurance_policies_updated
  BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 2. PATIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.patients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT DEFAULT 'MediFlow General Hospital',
  full_name            TEXT NOT NULL,
  dob                  DATE NOT NULL,
  insurance_member_id  TEXT,
  insurance_policy_id  UUID REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients_read') THEN
    CREATE POLICY "patients_read" ON public.patients FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patients_staff_write') THEN
    CREATE POLICY "patients_staff_write" ON public.patients FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor']))
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE TRIGGER patients_updated
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Extend cases table
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS org_id TEXT DEFAULT 'MediFlow General Hospital';

-- ============================================================
-- 3. SPECIALISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.specialists (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 TEXT DEFAULT 'MediFlow General Hospital',
  full_name              TEXT NOT NULL,
  specialty              TEXT NOT NULL,
  location_lat           NUMERIC NOT NULL,
  location_lng           NUMERIC NOT NULL,
  insurance_networks     TEXT[],
  calendar_api_token_ref TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialists TO authenticated;
GRANT ALL ON public.specialists TO service_role;
ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'specialists_read') THEN
    CREATE POLICY "specialists_read" ON public.specialists FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'specialists_staff_write') THEN
    CREATE POLICY "specialists_staff_write" ON public.specialists FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor']))
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE TRIGGER specialists_updated
  BEFORE UPDATE ON public.specialists
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 4. CASE DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  document_type TEXT,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_documents TO authenticated;
GRANT ALL ON public.case_documents TO service_role;
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'case_documents_read') THEN
    CREATE POLICY "case_documents_read" ON public.case_documents FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'case_documents_write') THEN
    CREATE POLICY "case_documents_write" ON public.case_documents FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician']))
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 5. HUMAN DECISIONS (no FK to tasks — avoids dependency issue)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.human_decisions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  action_center_task_id  UUID,
  decided_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision               TEXT NOT NULL
    CONSTRAINT chk_human_decision CHECK (decision IN ('approve','deny','escalate','request_info','complete')),
  reasoning              TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.human_decisions TO authenticated;
GRANT ALL ON public.human_decisions TO service_role;
ALTER TABLE public.human_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'human_decisions_read') THEN
    CREATE POLICY "human_decisions_read" ON public.human_decisions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'human_decisions_insert') THEN
    CREATE POLICY "human_decisions_insert" ON public.human_decisions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 6. CASE SUMMARIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_summaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  summary_text  TEXT NOT NULL,
  generated_by  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.case_summaries TO authenticated;
GRANT ALL ON public.case_summaries TO service_role;
ALTER TABLE public.case_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'case_summaries_read') THEN
    CREATE POLICY "case_summaries_read" ON public.case_summaries FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'case_summaries_insert') THEN
    CREATE POLICY "case_summaries_insert" ON public.case_summaries FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 7. NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled   BOOLEAN DEFAULT true,
  sms_enabled     BOOLEAN DEFAULT false,
  webhook_url     TEXT,
  snooze_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_prefs_own') THEN
    CREATE POLICY "notification_prefs_own" ON public.notification_prefs FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE TRIGGER notification_prefs_updated
  BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 8. SYSTEM CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_config TO authenticated;
GRANT ALL ON public.system_config TO service_role;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'system_config_read') THEN
    CREATE POLICY "system_config_read" ON public.system_config FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'system_config_supervisor_write') THEN
    CREATE POLICY "system_config_supervisor_write" ON public.system_config FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['supervisor']))
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE TRIGGER system_config_updated
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 9. ICD-10 CODES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.icd10_codes (
  code           TEXT PRIMARY KEY,
  description    TEXT NOT NULL,
  severity_score INT DEFAULT 1
    CONSTRAINT chk_icd10_severity CHECK (severity_score IN (1, 2, 3)),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.icd10_codes TO authenticated;
GRANT ALL ON public.icd10_codes TO service_role;
ALTER TABLE public.icd10_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'icd10_codes_read') THEN
    CREATE POLICY "icd10_codes_read" ON public.icd10_codes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================
-- 10. MEDICAL RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL
    CONSTRAINT chk_medical_record_type CHECK (record_type IN ('lab_result','imaging','clinical_note','discharge_summary','referral_letter')),
  content     TEXT,
  file_url    TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_records TO authenticated;
GRANT ALL ON public.medical_records TO service_role;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'medical_records_read') THEN
    CREATE POLICY "medical_records_read" ON public.medical_records FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'medical_records_write') THEN
    CREATE POLICY "medical_records_write" ON public.medical_records FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist','physician']))
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 11. PRESCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT chk_prescription_status CHECK (status IN ('active','completed','discontinued','on_hold')),
  prescribed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescriptions_read') THEN
    CREATE POLICY "prescriptions_read" ON public.prescriptions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prescriptions_write') THEN
    CREATE POLICY "prescriptions_write" ON public.prescriptions FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist','physician']))
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 12. INSURANCE CLAIMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  policy_id      UUID REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
  claim_number   TEXT UNIQUE,
  claim_amount   NUMERIC(10, 2),
  status         TEXT NOT NULL DEFAULT 'submitted'
    CONSTRAINT chk_insurance_claim_status CHECK (status IN ('submitted','pending','approved','denied','appealing','paid')),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claims TO authenticated;
GRANT ALL ON public.insurance_claims TO service_role;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_claims_read') THEN
    CREATE POLICY "insurance_claims_read" ON public.insurance_claims FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_claims_write') THEN
    CREATE POLICY "insurance_claims_write" ON public.insurance_claims FOR ALL TO authenticated
      USING  (public.current_user_has_any_role(ARRAY['coordinator','supervisor']))
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE TRIGGER insurance_claims_updated
  BEFORE UPDATE ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_patients_name         ON public.patients(full_name);
CREATE INDEX IF NOT EXISTS idx_specialists_specialty  ON public.specialists(specialty);
CREATE INDEX IF NOT EXISTS idx_case_documents_case    ON public.case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_human_decisions_case   ON public.human_decisions(case_id);
CREATE INDEX IF NOT EXISTS idx_case_summaries_case    ON public.case_summaries(case_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_case  ON public.insurance_claims(case_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_case     ON public.prescriptions(case_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_case   ON public.medical_records(case_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- ICD-10 Codes (severity: 1=Normal, 2=High, 3=Urgent)
INSERT INTO public.icd10_codes (code, description, severity_score) VALUES
  ('I25.10', 'Atherosclerotic heart disease of native coronary artery without angina pectoris', 2),
  ('I21.09', 'ST elevation (STEMI) myocardial infarction involving other coronary artery', 3),
  ('E11.9',  'Type 2 diabetes mellitus without complications', 1),
  ('E11.65', 'Type 2 diabetes mellitus with hyperglycemia', 2),
  ('M17.9',  'Osteoarthritis of knee, unspecified', 1),
  ('M54.5',  'Low back pain', 1),
  ('C50.912','Malignant neoplasm of unspecified site of left female breast', 3),
  ('C34.10', 'Malignant neoplasm of upper lobe, bronchus or lung, unspecified', 3),
  ('L20.9',  'Atopic dermatitis, unspecified', 1),
  ('G40.909','Epilepsy, unspecified, not intractable, without status epilepticus', 2),
  ('G35',    'Multiple sclerosis', 2),
  ('J45.909','Unspecified asthma, uncomplicated', 2),
  ('K57.30', 'Diverticulosis of large intestine without perforation or abscess without bleeding', 1),
  ('N18.3',  'Chronic kidney disease, stage 3 (moderate)', 2)
ON CONFLICT (code) DO UPDATE
  SET description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score;

-- Insurance Policies
INSERT INTO public.insurance_policies (id, insurer_name, group_id, coverage_tier, network_specialists) VALUES
  ('e2a4a7b0-2b10-4ea5-8025-a1d2d3e4f5a1', 'Atlas Health',      'GP-ATLAS-99', 'Gold',     ARRAY['Cardiology (Heart)','Neurology (Brain & Nerves)','Oncology (Cancer)','Orthopedics (Bones & Joints)']),
  ('e2a4a7b0-2b10-4ea5-8025-a1d2d3e4f5a2', 'Cigna Premium',     'GP-CIGNA-88', 'Platinum', ARRAY['Cardiology (Heart)','Neurology (Brain & Nerves)','Orthopedics (Bones & Joints)','Dermatology (Skin)']),
  ('e2a4a7b0-2b10-4ea5-8025-a1d2d3e4f5a3', 'UnitedHealthcare',  'GP-UHC-77',   'Silver',   ARRAY['Cardiology (Heart)','Orthopedics (Bones & Joints)','Endocrinology (Hormones)'])
ON CONFLICT (id) DO NOTHING;

-- Specialists (3 per specialty × 6 specialties = 18)
INSERT INTO public.specialists (id, full_name, specialty, location_lat, location_lng, insurance_networks, calendar_api_token_ref) VALUES
  -- Cardiology (Heart)
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b1', 'Dr. Robert Vance',  'Cardiology (Heart)',             37.7749, -122.4194, ARRAY['Atlas Health','Cigna Premium','UnitedHealthcare'], 'token_vance'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b7', 'Dr. Anita Rao',     'Cardiology (Heart)',             37.7781, -122.4223, ARRAY['Atlas Health','Cigna Premium'],                   'token_rao'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b8', 'Dr. Michael Tran',  'Cardiology (Heart)',             37.7712, -122.4176, ARRAY['UnitedHealthcare'],                               'token_tran'),
  -- Neurology (Brain & Nerves)
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b2', 'Dr. Sarah Lin',     'Neurology (Brain & Nerves)',     37.7833, -122.4167, ARRAY['Atlas Health','Cigna Premium'],                   'token_lin'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b9', 'Dr. David Okafor',  'Neurology (Brain & Nerves)',     37.7805, -122.4140, ARRAY['Atlas Health','UnitedHealthcare'],                 'token_okafor'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6ba', 'Dr. Lisa Park',     'Neurology (Brain & Nerves)',     37.7850, -122.4182, ARRAY['Cigna Premium','UnitedHealthcare'],               'token_park'),
  -- Orthopedics (Bones & Joints)
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b3', 'Dr. James Carter',  'Orthopedics (Bones & Joints)',   37.7699, -122.4468, ARRAY['Atlas Health','UnitedHealthcare'],                 'token_carter'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6bb', 'Dr. Rachel Kim',    'Orthopedics (Bones & Joints)',   37.7672, -122.4491, ARRAY['Atlas Health','Cigna Premium'],                   'token_kim'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6bc', 'Dr. Carlos Mendez', 'Orthopedics (Bones & Joints)',   37.7725, -122.4443, ARRAY['Cigna Premium','UnitedHealthcare'],               'token_mendez'),
  -- Oncology (Cancer)
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b4', 'Dr. Emily Watson',  'Oncology (Cancer)',               37.7599, -122.4368, ARRAY['Atlas Health','Cigna Premium','UnitedHealthcare'], 'token_watson'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6bd', 'Dr. Frank Okonkwo', 'Oncology (Cancer)',               37.7575, -122.4392, ARRAY['Atlas Health','Cigna Premium'],                   'token_okonkwo'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6be', 'Dr. Grace Liu',     'Oncology (Cancer)',               37.7620, -122.4345, ARRAY['UnitedHealthcare'],                               'token_liu'),
  -- Dermatology (Skin)
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b5', 'Dr. Priya Sharma',  'Dermatology (Skin)',              37.7800, -122.4100, ARRAY['Cigna Premium'],                                  'token_sharma'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6bf', 'Dr. Kevin Brown',   'Dermatology (Skin)',              37.7778, -122.4134, ARRAY['Atlas Health','UnitedHealthcare'],                 'token_brown'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6c0', 'Dr. Nina Patel',    'Dermatology (Skin)',              37.7822, -122.4088, ARRAY['Atlas Health','Cigna Premium'],                   'token_patel'),
  -- Endocrinology (Hormones)
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6b6', 'Dr. Marcus Bell',   'Endocrinology (Hormones)',        37.7650, -122.4250, ARRAY['Atlas Health','UnitedHealthcare'],                 'token_bell'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6c1', 'Dr. Olivia Reed',   'Endocrinology (Hormones)',        37.7628, -122.4277, ARRAY['Atlas Health','Cigna Premium'],                   'token_reed'),
  ('f3b5b8c0-3c20-5fa6-9136-b2d3d4e5f6c2', 'Dr. Samir Hassan',  'Endocrinology (Hormones)',        37.7675, -122.4225, ARRAY['Cigna Premium','UnitedHealthcare'],               'token_hassan')
ON CONFLICT (id) DO NOTHING;

-- System Configuration
INSERT INTO public.system_config (config_key, config_value) VALUES
  ('sla_hours_stat',                   '2'),
  ('sla_hours_urgent',                 '8'),
  ('sla_hours_routine',                '48'),
  ('max_preauth_retries',              '3'),
  ('preauth_retry_delay_seconds',      '5'),
  ('followup_days_after_visit',        '7'),
  ('escalation_days_no_outcome',       '14'),
  ('action_center_sla_hours',          '4'),
  ('weekly_report_day',                'Monday'),
  ('weekly_report_time_local',         '08:00')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
