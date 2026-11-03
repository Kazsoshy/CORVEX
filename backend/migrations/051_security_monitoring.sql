-- ============================================================
-- CORVEX Security Monitoring
-- Migration: 051_security_monitoring.sql
-- Automatic threat detection event store + monitor health
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS security_events (
  event_id            SERIAL PRIMARY KEY,
  event_key           VARCHAR(240) NOT NULL,
  threat_type         VARCHAR(80)  NOT NULL,
  severity            VARCHAR(20)  NOT NULL
                      CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
  title               VARCHAR(200) NOT NULL,
  description         TEXT         NOT NULL,
  detection_method    VARCHAR(120) NOT NULL,
  evidence            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  source_ip           VARCHAR(45),
  user_id             INTEGER,
  user_name           VARCHAR(150),
  affected_resource   VARCHAR(400),
  status              VARCHAR(30)  NOT NULL DEFAULT 'Open'
                      CHECK (status IN ('Open', 'Investigating', 'Resolved', 'False Positive')),
  auto_action         VARCHAR(120),
  notified_at         TIMESTAMP,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_security_events_open_key
  ON security_events (event_key)
  WHERE status IN ('Open', 'Investigating');

CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON security_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON security_events (severity);

CREATE INDEX IF NOT EXISTS idx_security_events_threat_type
  ON security_events (threat_type);

CREATE INDEX IF NOT EXISTS idx_security_events_status
  ON security_events (status);

CREATE TABLE IF NOT EXISTS security_monitor_health (
  component         VARCHAR(80) PRIMARY KEY,
  status            VARCHAR(30) NOT NULL DEFAULT 'Unavailable'
                    CHECK (status IN ('Active', 'Degraded', 'Unavailable')),
  last_run_at       TIMESTAMP,
  last_success_at   TIMESTAMP,
  detail            TEXT,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO security_monitor_health (component, status, detail)
VALUES
  ('request_inspector', 'Unavailable', 'Waiting for first request.'),
  ('auth_monitor', 'Unavailable', 'Waiting for authentication activity.'),
  ('file_scanner', 'Unavailable', 'Waiting for first upload scan.'),
  ('audit_analyzer', 'Unavailable', 'Waiting for first sweep.'),
  ('dependency_audit', 'Unavailable', 'Waiting for first scheduled audit.'),
  ('config_assessment', 'Unavailable', 'Waiting for first assessment.'),
  ('clamav_integration', 'Unavailable', 'Optional ClamAV daemon not configured.')
ON CONFLICT (component) DO NOTHING;

COMMIT;
