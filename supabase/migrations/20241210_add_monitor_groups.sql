-- Monitor Groups Migration
-- Run this in your Supabase SQL editor to add groups functionality

-- Create monitor_groups table
CREATE TABLE IF NOT EXISTS monitor_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1', -- Default indigo color
  collapsed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add group_id to monitors (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'monitors' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE monitors ADD COLUMN group_id UUID REFERENCES monitor_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster group queries
CREATE INDEX IF NOT EXISTS idx_monitors_group_id ON monitors(group_id);
CREATE INDEX IF NOT EXISTS idx_monitor_groups_user_id ON monitor_groups(user_id);

-- Enable RLS on monitor_groups
ALTER TABLE monitor_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for monitor_groups
CREATE POLICY "Users can view own groups"
  ON monitor_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own groups"
  ON monitor_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own groups"
  ON monitor_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own groups"
  ON monitor_groups FOR DELETE
  USING (auth.uid() = user_id);
