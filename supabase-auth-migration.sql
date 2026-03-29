-- ============================================================
-- Envision — Add user_id to existing tables for multi-user auth
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Add user_id to decisions table
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Add user_id to visualizer_projects table
ALTER TABLE visualizer_projects ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Create indexes for user lookups
CREATE INDEX IF NOT EXISTS idx_decisions_user_id ON decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_viz_projects_user_id ON visualizer_projects(user_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE renderings ENABLE ROW LEVEL SECURITY;
ALTER TABLE visualizer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE visualizer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE visualizer_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE visualizer_renderings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see/modify their own data

-- Decisions
CREATE POLICY "Users see own decisions" ON decisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own decisions" ON decisions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own decisions" ON decisions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own decisions" ON decisions FOR DELETE USING (auth.uid() = user_id);

-- Rooms (via decision ownership)
CREATE POLICY "Users see own rooms" ON rooms FOR SELECT USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = rooms.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users insert own rooms" ON rooms FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = rooms.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users update own rooms" ON rooms FOR UPDATE USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = rooms.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users delete own rooms" ON rooms FOR DELETE USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = rooms.decision_id AND decisions.user_id = auth.uid())
);

-- Options
CREATE POLICY "Users see own options" ON options FOR SELECT USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = options.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users insert own options" ON options FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = options.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users update own options" ON options FOR UPDATE USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = options.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users delete own options" ON options FOR DELETE USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = options.decision_id AND decisions.user_id = auth.uid())
);

-- Option Photos
CREATE POLICY "Users see own photos" ON option_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM options JOIN decisions ON decisions.id = options.decision_id WHERE options.id = option_photos.option_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users insert own photos" ON option_photos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM options JOIN decisions ON decisions.id = options.decision_id WHERE options.id = option_photos.option_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users delete own photos" ON option_photos FOR DELETE USING (
  EXISTS (SELECT 1 FROM options JOIN decisions ON decisions.id = options.decision_id WHERE options.id = option_photos.option_id AND decisions.user_id = auth.uid())
);

-- Renderings
CREATE POLICY "Users see own renderings" ON renderings FOR SELECT USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = renderings.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users insert own renderings" ON renderings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = renderings.decision_id AND decisions.user_id = auth.uid())
);
CREATE POLICY "Users delete own renderings" ON renderings FOR DELETE USING (
  EXISTS (SELECT 1 FROM decisions WHERE decisions.id = renderings.decision_id AND decisions.user_id = auth.uid())
);

-- Visualizer Projects
CREATE POLICY "Users see own viz projects" ON visualizer_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own viz projects" ON visualizer_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own viz projects" ON visualizer_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own viz projects" ON visualizer_projects FOR DELETE USING (auth.uid() = user_id);

-- Visualizer Categories
CREATE POLICY "Users see own viz categories" ON visualizer_categories FOR SELECT USING (
  EXISTS (SELECT 1 FROM visualizer_projects WHERE visualizer_projects.id = visualizer_categories.project_id AND visualizer_projects.user_id = auth.uid())
);
CREATE POLICY "Users insert own viz categories" ON visualizer_categories FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM visualizer_projects WHERE visualizer_projects.id = visualizer_categories.project_id AND visualizer_projects.user_id = auth.uid())
);
CREATE POLICY "Users delete own viz categories" ON visualizer_categories FOR DELETE USING (
  EXISTS (SELECT 1 FROM visualizer_projects WHERE visualizer_projects.id = visualizer_categories.project_id AND visualizer_projects.user_id = auth.uid())
);

-- Visualizer Options
CREATE POLICY "Users see own viz options" ON visualizer_options FOR SELECT USING (
  EXISTS (SELECT 1 FROM visualizer_categories vc JOIN visualizer_projects vp ON vp.id = vc.project_id WHERE vc.id = visualizer_options.category_id AND vp.user_id = auth.uid())
);
CREATE POLICY "Users insert own viz options" ON visualizer_options FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM visualizer_categories vc JOIN visualizer_projects vp ON vp.id = vc.project_id WHERE vc.id = visualizer_options.category_id AND vp.user_id = auth.uid())
);
CREATE POLICY "Users delete own viz options" ON visualizer_options FOR DELETE USING (
  EXISTS (SELECT 1 FROM visualizer_categories vc JOIN visualizer_projects vp ON vp.id = vc.project_id WHERE vc.id = visualizer_options.category_id AND vp.user_id = auth.uid())
);

-- Visualizer Renderings
CREATE POLICY "Users see own viz renderings" ON visualizer_renderings FOR SELECT USING (
  EXISTS (SELECT 1 FROM visualizer_projects WHERE visualizer_projects.id = visualizer_renderings.project_id AND visualizer_projects.user_id = auth.uid())
);
CREATE POLICY "Users insert own viz renderings" ON visualizer_renderings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM visualizer_projects WHERE visualizer_projects.id = visualizer_renderings.project_id AND visualizer_projects.user_id = auth.uid())
);
CREATE POLICY "Users delete own viz renderings" ON visualizer_renderings FOR DELETE USING (
  EXISTS (SELECT 1 FROM visualizer_projects WHERE visualizer_projects.id = visualizer_renderings.project_id AND visualizer_projects.user_id = auth.uid())
);
