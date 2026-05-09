-- Silica v1 — Migration 0001: heuristic table
-- Stores versioned heuristics with three-pool tenant visibility.
-- design/heuristic-schema.md §Storage

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS heuristic (
  -- Identity
  id              TEXT        NOT NULL,
  version         INTEGER     NOT NULL CHECK (version > 0),
  PRIMARY KEY (id, version),

  schema_version  TEXT        NOT NULL DEFAULT 'silica.heuristic.v0',

  -- Status + lifecycle
  status          TEXT        NOT NULL CHECK (status IN ('proposed', 'active', 'deprecated')),
  deprecated      BOOLEAN     NOT NULL DEFAULT FALSE,
  deprecation_reason TEXT,
  supersedes      TEXT,

  -- Core fields
  name            TEXT        NOT NULL,
  summary         TEXT        NOT NULL,
  category        TEXT        NOT NULL,
  vm_scope        TEXT[]      NOT NULL,
  taxonomy_links  TEXT[]      NOT NULL DEFAULT '{}',
  swc_mapping     TEXT,

  -- Observational statistics
  confidence_prior  NUMERIC(4,3) NOT NULL CHECK (confidence_prior BETWEEN 0 AND 1),
  fp_rate_observed  NUMERIC(4,3),
  tp_rate_observed  NUMERIC(4,3),
  n_observations    INTEGER     NOT NULL DEFAULT 0,
  last_observation_at TIMESTAMPTZ,

  -- Severity
  severity_default TEXT        NOT NULL CHECK (severity_default IN ('critical','high','medium','low','informational')),

  -- Multi-tenant three-pool model
  tenant_visibility TEXT        NOT NULL CHECK (tenant_visibility IN ('public','shared-pool','private-tenant')),
  tenant_id        TEXT,

  -- Full JSONB body for non-indexed fields (lineage, applicability, implementations, etc.)
  body             JSONB       NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS heuristic_status_idx ON heuristic (status);
CREATE INDEX IF NOT EXISTS heuristic_vm_scope_idx ON heuristic USING GIN (vm_scope);
CREATE INDEX IF NOT EXISTS heuristic_category_idx ON heuristic (category);
CREATE INDEX IF NOT EXISTS heuristic_tenant_visibility_idx ON heuristic (tenant_visibility);
CREATE INDEX IF NOT EXISTS heuristic_tenant_id_idx ON heuristic (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS heuristic_deprecated_idx ON heuristic (deprecated);
