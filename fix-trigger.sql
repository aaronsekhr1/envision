-- Fix: the viz_opt_update trigger references NEW.project_id,
-- but visualizer_options has category_id, not project_id.
-- This replaces the trigger function with one that looks up
-- the project through the category.

DROP TRIGGER IF EXISTS viz_opt_update ON visualizer_options;

CREATE OR REPLACE FUNCTION update_viz_project_via_option()
RETURNS trigger AS $$
BEGIN
  UPDATE visualizer_projects SET updated_at = now()
  WHERE id = (SELECT project_id FROM visualizer_categories WHERE id = NEW.category_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER viz_opt_update
  AFTER INSERT OR UPDATE ON visualizer_options
  FOR EACH ROW EXECUTE FUNCTION update_viz_project_via_option();
