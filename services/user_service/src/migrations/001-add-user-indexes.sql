-- Migration script to add indexes for user management
-- This ensures optimal performance for user queries

-- Create unique indexes for primary identifiers
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_id ON profile_details (userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email ON profile_details (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone ON profile_details (phone);

-- Create non-unique indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_role_id ON profile_details (role_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON profile_details (created_at);
CREATE INDEX IF NOT EXISTS idx_full_name ON profile_details (first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_role ON profile_details (role);
CREATE INDEX IF NOT EXISTS idx_status ON profile_details (status);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_role_status ON profile_details (role, status);
CREATE INDEX IF NOT EXISTS idx_created_by_date ON profile_details (created_by, created_at);

-- Add comments for documentation
COMMENT ON INDEX idx_user_id IS 'Unique index on userId for primary key lookups';
COMMENT ON INDEX idx_email IS 'Unique index on email for authentication and uniqueness checks';
COMMENT ON INDEX idx_phone IS 'Unique index on phone for uniqueness checks and lookups';
COMMENT ON INDEX idx_role_id IS 'Index on role_id for role-based filtering';
COMMENT ON INDEX idx_created_at IS 'Index on created_at for chronological sorting';
COMMENT ON INDEX idx_full_name IS 'Composite index on first_name and last_name for name searches';
COMMENT ON INDEX idx_role IS 'Index on role for role-based filtering';
COMMENT ON INDEX idx_status IS 'Index on status for active/inactive user filtering';
COMMENT ON INDEX idx_role_status IS 'Composite index for role and status filtering';
COMMENT ON INDEX idx_created_by_date IS 'Composite index for audit trail queries';