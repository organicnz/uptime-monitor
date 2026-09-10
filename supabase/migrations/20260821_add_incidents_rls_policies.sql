-- Add missing RLS policies for incidents table

CREATE POLICY "Users can view own incidents" ON incidents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM monitors 
    WHERE monitors.id = incidents.monitor_id 
    AND monitors.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own incidents" ON incidents FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM monitors 
    WHERE monitors.id = incidents.monitor_id 
    AND monitors.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own incidents" ON incidents FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM monitors 
    WHERE monitors.id = incidents.monitor_id 
    AND monitors.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own incidents" ON incidents FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM monitors 
    WHERE monitors.id = incidents.monitor_id 
    AND monitors.user_id = auth.uid()
  )
);

-- Allow public viewing of incidents linked to public status pages
CREATE POLICY "Public can view public status page incidents" ON incidents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM status_page_monitors
    JOIN status_pages ON status_pages.id = status_page_monitors.status_page_id
    WHERE status_page_monitors.monitor_id = incidents.monitor_id
    AND status_pages.is_public = true
  )
);
