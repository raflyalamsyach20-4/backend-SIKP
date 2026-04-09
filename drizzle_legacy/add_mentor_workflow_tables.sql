-- Mentor workflow tables for approval, activation, email change, and audit logs

CREATE TABLE IF NOT EXISTS mentor_approval_requests (
  id text PRIMARY KEY,
  student_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_name varchar(255) NOT NULL,
  mentor_email varchar(255) NOT NULL,
  mentor_phone varchar(20),
  company_name varchar(255),
  position varchar(100),
  company_address text,
  status approval_status NOT NULL DEFAULT 'PENDING',
  rejection_reason text,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentor_email_change_requests (
  id text PRIMARY KEY,
  mentor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_email varchar(255) NOT NULL,
  requested_email varchar(255) NOT NULL,
  reason text,
  status approval_status NOT NULL DEFAULT 'PENDING',
  rejection_reason text,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentor_activation_tokens (
  id text PRIMARY KEY,
  mentor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token varchar(255) NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  action varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id text NOT NULL,
  details json NOT NULL DEFAULT '{}'::json,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentor_approval_requests_status ON mentor_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_mentor_email_change_requests_status ON mentor_email_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_mentor_activation_tokens_mentor_id ON mentor_activation_tokens(mentor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
