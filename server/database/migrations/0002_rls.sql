-- Tenant isolation. Application transactions must SET LOCAL app.tenant_id.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'candidate_profiles','job_descriptions','applications','research_runs',
    'research_sources','research_findings','evidence_items','evidence_metrics',
    'evidence_attachments','evidence_application_matches','resumes','resume_versions',
    'resume_sections','resume_claims','audit_runs','audit_findings','audit_decisions',
    'mistake_memory_rules','final_qa_runs','final_qa_checks','stored_files',
    'workflow_runs','workflow_events','usage_ledger','notifications',
    'radar_jobs','radar_job_sightings','radar_saved_searches','radar_job_alerts'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'tenant_isolation'
      ) THEN
        EXECUTE format(
          'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
          table_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
