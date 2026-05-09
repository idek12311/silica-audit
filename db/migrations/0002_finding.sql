-- Silica v1 — Migration 0002: finding table
-- Stores versioned findings with heuristic citations.
-- design/schema-draft-v0.md

CREATE TABLE IF NOT EXISTS finding (
  id              TEXT        PRIMARY KEY,
  canonical_id    TEXT        NOT NULL,
  audit_id        TEXT        NOT NULL,
  tenant_id       TEXT        NOT NULL,
  schema_version  TEXT        NOT NULL,

  -- Core classification
  taxonomy_id     TEXT        NOT NULL,
  severity_level  TEXT        NOT NULL CHECK (severity_level IN ('critical','high','medium','low','informational')),
  confidence_score NUMERIC(4,3) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),

  -- Validation state
  highest_passed      TEXT    NOT NULL,
  highest_applicable  TEXT    NOT NULL,

  -- VM kind for quick filtering
  subject_kind    TEXT        NOT NULL CHECK (subject_kind IN ('evm','svm','off-chain')),

  -- Status lifecycle
  status          TEXT        NOT NULL CHECK (status IN ('candidate','confirmed','disputed','rejected','fixed')),

  -- Scope artifact (mandatory for off-chain)
  scope_artifact_id TEXT,

  -- Full JSONB body (subject, evidence, heuristics_cited, agent_provenance, lifecycle, etc.)
  body            JSONB       NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS finding_canonical_id_idx ON finding (canonical_id);
CREATE INDEX IF NOT EXISTS finding_audit_id_idx ON finding (audit_id);
CREATE INDEX IF NOT EXISTS finding_tenant_id_idx ON finding (tenant_id);
CREATE INDEX IF NOT EXISTS finding_taxonomy_id_idx ON finding (taxonomy_id);
CREATE INDEX IF NOT EXISTS finding_status_idx ON finding (status);
CREATE INDEX IF NOT EXISTS finding_subject_kind_idx ON finding (subject_kind);

-- Heuristic citations denormalized for fast count queries (§I acceptance criterion)
CREATE INDEX IF NOT EXISTS finding_heuristics_cited_idx ON finding USING GIN ((body -> 'heuristics_cited'));
