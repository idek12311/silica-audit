-- Silica v1 — Migration 0004: audit_event table
-- Observability spine: every state transition, router decision, and cost increment.
-- 10-reporting-contract.md §H

-- Requires ulid generation; use gen_random_uuid() as fallback if ulid extension unavailable
CREATE TABLE IF NOT EXISTS audit_event (
  id              TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  audit_id        TEXT         NOT NULL REFERENCES audit(id),
  ts              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  state           TEXT         NOT NULL,
  agent_id        TEXT,
  router          TEXT,
  finding_id      TEXT         REFERENCES finding(id),
  cost_usd        NUMERIC(12,4),
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  details         JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX ON audit_event (audit_id, ts);
CREATE INDEX ON audit_event (finding_id) WHERE finding_id IS NOT NULL;
