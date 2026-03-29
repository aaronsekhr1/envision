-- Add placement column to visualizer_options
-- Run this in Supabase SQL Editor
ALTER TABLE visualizer_options
ADD COLUMN IF NOT EXISTS placement text DEFAULT NULL;
