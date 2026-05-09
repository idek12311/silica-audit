-- Silica v1 — Migration 0003: audit table
-- Stores audit job records.
-- src/orchestrator/audit-job.ts Contract E

CREATE TABLE IF NOT EXISTS audit (
  id              TEXT        PRIMARY KEY,
  tenant_id       TEXT        NOT NULL,
  state           TEXT        NOT NULL CHECK (state IN (
    'pending','fetching','compiling','static-analyzing',
    'analyzer-pass','prover-pass','skeptic-pass','consolidating',
    'persisting','completed','failed','budget-truncated','cancelled'
  )),

  -- Input spec
  subject_kind    TEXT        NOT NULL CHECK (subject_kind IN ('evm','svm','off-chain')),
  target_address  TEXT,        -- EVM address or SVM program_id for quick lookup
  chain_id        INTEGER,     -- EVM chain ID

  -- Budget tracking (design/cost-model.md)
  budget_usd      NUMERIC(10,4),
  cost_usd        NUMERIC(10,4) NOT NULL DEFAULT 0,
  tokens_in       INTEGER      NOT NULL DEFAULT 0,
  tokens_out      INTEGER      NOT NULL DEFAULT 0,

  -- Toolchain manifest (for reproducibility, Invariant #4)
  toolchain_manifest JSONB,

  -- Scope artifact (off-chain perimeter audits)
  scope_artifact_id TEXT,

  body            JSONB        NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audit_tenant_id_idx ON audit (tenant_id);
CREATE INDEX IF NOT EXISTS audit_state_idx ON audit (state);
CREATE INDEX IF NOT EXISTS audit_target_address_idx ON audit (target_address) WHERE target_address IS NOT NULL;
