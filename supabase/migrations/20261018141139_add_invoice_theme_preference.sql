ALTER TABLE public.workspace_settings
  ADD COLUMN IF NOT EXISTS invoice_theme text NOT NULL DEFAULT 'light';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_settings_invoice_theme_check'
      AND conrelid = 'public.workspace_settings'::regclass
  ) THEN
    ALTER TABLE public.workspace_settings
      ADD CONSTRAINT workspace_settings_invoice_theme_check
      CHECK (invoice_theme = ANY (ARRAY['light'::text, 'dark'::text, 'gold'::text, 'red'::text, 'yellow-black'::text]));
  END IF;
END $$;
