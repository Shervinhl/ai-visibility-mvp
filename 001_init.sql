-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  description TEXT,
  industry VARCHAR(100),
  founded_year INTEGER,
  website_url VARCHAR(500),
  entity_type VARCHAR(50),
  entity_names JSONB,
  locations JSONB,
  parent_organization UUID,
  brand_relationships JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audits
CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_type VARCHAR(50) DEFAULT 'full',
  status VARCHAR(20) DEFAULT 'queued',
  engines_to_run JSONB DEFAULT '["E1", "E2", "E3", "E4", "E5"]',
  signal_types JSONB DEFAULT '["A", "B", "C", "D"]',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  crawled_pages JSONB,
  structured_data JSONB,
  ai_queries JSONB,
  error_message TEXT,
  error_stack TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Signals
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  engine_id VARCHAR(10) NOT NULL,
  signal_code VARCHAR(20) NOT NULL,
  signal_type VARCHAR(10) NOT NULL,
  name VARCHAR(255),
  description TEXT,
  raw_value FLOAT,
  normalized_score FLOAT CHECK (normalized_score >= 0 AND normalized_score <= 100),
  confidence FLOAT,
  evidence JSONB,
  computation_details JSONB,
  ai_assessment TEXT,
  ai_reasoning JSONB,
  ai_system_responses JSONB,
  cross_source_alignment JSONB,
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(audit_id, signal_code)
);

-- Engine Scores
CREATE TABLE IF NOT EXISTS engine_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  engine_id VARCHAR(10) NOT NULL,
  score FLOAT CHECK (score >= 0 AND score <= 100),
  signal_count INTEGER,
  signals_median FLOAT,
  signals_std_dev FLOAT,
  type_a_count INTEGER DEFAULT 0,
  type_b_count INTEGER DEFAULT 0,
  type_c_count INTEGER DEFAULT 0,
  type_d_count INTEGER DEFAULT 0,
  previous_score FLOAT,
  score_change FLOAT,
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(audit_id, engine_id)
);

-- AI Visibility Scores
CREATE TABLE IF NOT EXISTS ai_visibility_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE UNIQUE,
  overall_score FLOAT CHECK (overall_score >= 0 AND overall_score <= 100),
  retrieval_score FLOAT,
  entity_score FLOAT,
  semantic_score FLOAT,
  authority_score FLOAT,
  generative_score FLOAT,
  competitive_score FLOAT,
  response_score FLOAT,
  type_a_average FLOAT,
  type_b_average FLOAT,
  type_c_average FLOAT,
  type_d_average FLOAT,
  previous_overall_score FLOAT,
  score_change FLOAT,
  computed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Reports
CREATE TABLE IF NOT EXISTS audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  report_type VARCHAR(50),
  format VARCHAR(20),
  file_path VARCHAR(500),
  file_size_bytes INTEGER,
  generated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audits_org ON audits(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_signals_audit ON signals(audit_id);
CREATE INDEX IF NOT EXISTS idx_signals_engine ON signals(engine_id);
CREATE INDEX IF NOT EXISTS idx_signals_code ON signals(signal_code);
CREATE INDEX IF NOT EXISTS idx_engine_scores_audit ON engine_scores(audit_id);
CREATE INDEX IF NOT EXISTS idx_visibility_audit ON ai_visibility_scores(audit_id);

-- Insert sample organization for testing
INSERT INTO organizations (name, domain, website_url, description)
VALUES (
  'Sample Company',
  'example.com',
  'https://example.com',
  'A sample organization for testing'
) ON CONFLICT DO NOTHING;
