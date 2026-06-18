
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('coordinator','physician','specialist','supervisor');
CREATE TYPE public.case_stage AS ENUM ('intake','pre_auth','scheduling','appointment','follow_up','closed','cancelled');
CREATE TYPE public.case_priority AS ENUM ('routine','urgent','stat');
CREATE TYPE public.preauth_status AS ENUM ('pending','approved','denied','appealing');
CREATE TYPE public.appointment_status AS ENUM ('proposed','confirmed','completed','cancelled','no_show');
CREATE TYPE public.task_kind AS ENUM ('verify_insurance','review_preauth','select_specialist','confirm_slot','record_outcome','escalate','schedule_follow_up');
CREATE TYPE public.task_status AS ENUM ('open','in_progress','completed','escalated','cancelled');
CREATE TYPE public.actor_type AS ENUM ('human','rpa','ai_agent','system');

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  organization TEXT DEFAULT 'MediFlow General Hospital',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(_roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY(_roles))
$$;

-- New users -> profile + coordinator role by default
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'coordinator')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CASES
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL DEFAULT ('MF-' || lpad((floor(random()*900000+100000))::text, 6, '0')),
  mrn TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  patient_dob DATE,
  specialty TEXT NOT NULL,
  priority public.case_priority NOT NULL DEFAULT 'routine',
  stage public.case_stage NOT NULL DEFAULT 'intake',
  referring_physician_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referring_physician_name TEXT,
  sla_due_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases visible to staff" ON public.cases FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor']::public.app_role[])
  OR referring_physician_id = auth.uid()
);
CREATE POLICY "cases insert by staff" ON public.cases FOR INSERT TO authenticated WITH CHECK (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician']::public.app_role[])
);
CREATE POLICY "cases update by staff" ON public.cases FOR UPDATE TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor']::public.app_role[])
);
CREATE TRIGGER cases_updated BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- REFERRALS
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  diagnosis_code TEXT,
  diagnosis_description TEXT,
  clinical_notes TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals read" ON public.referrals FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician']::public.app_role[])
);
CREATE POLICY "referrals write" ON public.referrals FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','physician']::public.app_role[])
) WITH CHECK (true);

-- PRE-AUTHORIZATIONS
CREATE TABLE public.pre_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  payer TEXT,
  status public.preauth_status NOT NULL DEFAULT 'pending',
  denial_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_authorizations TO authenticated;
GRANT ALL ON public.pre_authorizations TO service_role;
ALTER TABLE public.pre_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preauth staff" ON public.pre_authorizations FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor']::public.app_role[])
) WITH CHECK (true);

-- APPOINTMENTS
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  specialist_name TEXT NOT NULL,
  specialist_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  status public.appointment_status NOT NULL DEFAULT 'proposed',
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appt staff" ON public.appointments FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist']::public.app_role[])
) WITH CHECK (true);

-- FOLLOW UPS
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  outcome_notes TEXT,
  next_action TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup staff" ON public.follow_ups FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist']::public.app_role[])
) WITH CHECK (true);

-- TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  kind public.task_kind NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee_role public.app_role NOT NULL DEFAULT 'coordinator',
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.task_status NOT NULL DEFAULT 'open',
  sla_due_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks read staff" ON public.tasks FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist','physician']::public.app_role[])
);
CREATE POLICY "tasks write staff" ON public.tasks FOR ALL TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor']::public.app_role[])
) WITH CHECK (true);

-- CASE EVENTS (audit / timeline)
CREATE TABLE public.case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_type public.actor_type NOT NULL DEFAULT 'system',
  actor_label TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.case_events TO authenticated;
GRANT ALL ON public.case_events TO service_role;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events read staff" ON public.case_events FOR SELECT TO authenticated USING (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor','specialist','physician']::public.app_role[])
);
CREATE POLICY "events insert staff" ON public.case_events FOR INSERT TO authenticated WITH CHECK (
  public.current_user_has_any_role(ARRAY['coordinator','supervisor']::public.app_role[])
);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif own" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_cases_stage ON public.cases(stage);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_case ON public.tasks(case_id);
CREATE INDEX idx_events_case ON public.case_events(case_id, created_at DESC);
