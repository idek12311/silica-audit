import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// canonicalize is a CommonJS module; require() is needed for ESM interop
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const rfc8785: (value: unknown) => string | undefined = _require('canonicalize');
import type { Finding, EvmLocator, SvmLocator, OffChainLocator } from './schema.js';

/**
 * Computes the canonical_id for a finding.
 *
 * Formula (notes.md §17.7):
 *   sha256(rfc8785(canonical_subject_locator) || 0x1f || taxonomy_id || 0x1f || rfc8785(canonical_invariant_violated))
 *
 * The 0x1f (ASCII Unit Separator) prevents field-boundary collision attacks.
 * RFC 8785 (JSON Canonicalization Scheme) ensures stable serialization.
 */
export function computeCanonicalId(params: CanonicalIdParams): string {
  const sep = '\x1f';
  const parts = [
    rfc8785(params.canonicalSubjectLocator) ?? '{}',
    params.taxonomyId,
    rfc8785(params.canonicalInvariantViolated) ?? '{}',
  ];
  const payload = parts.join(sep);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export interface CanonicalIdParams {
  /** VM-specific canonical subject locator. For EVM: { chain_id, address, bytecode_hash, impl_resolution_strategy }. */
  canonicalSubjectLocator: Record<string, unknown>;
  /** Bug-class taxonomy_id from bug-taxonomy.md — NOT the human-readable label. */
  taxonomyId: string;
  /** Structured spec of the violated property; per-class canonicalizer defines this shape. */
  canonicalInvariantViolated: Record<string, unknown>;
}

/**
 * Derives the canonical subject locator from a parsed Finding's Subject.
 *
 * EVM: (chain_id, address, impl_resolution_strategy) — bytecode_hash is ideal but
 * requires resolved bytecode; we use address + resolution strategy as the stable key.
 * SVM: (cluster, program_id, program_version)
 * Off-chain: (off_chain_kind, url or domain or github_org)
 */
export function subjectToCanonicalLocator(finding: Finding): Record<string, unknown> {
  const { subject } = finding;
  if (subject.kind === 'evm') {
    return evmLocatorToCanonical(subject.primary_locator);
  }
  if (subject.kind === 'svm') {
    return svmLocatorToCanonical(subject.primary_locator);
  }
  return offChainLocatorToCanonical(subject.primary_locator);
}

function evmLocatorToCanonical(loc: EvmLocator): Record<string, unknown> {
  return {
    vm: 'evm',
    chain_id: loc.chain_id,
    address: loc.address.toLowerCase(),
    impl_resolution_strategy: loc.implementation_resolution.strategy,
  };
}

function svmLocatorToCanonical(loc: SvmLocator): Record<string, unknown> {
  return {
    vm: 'svm',
    cluster: loc.cluster,
    program_id: loc.program_id,
    program_version: loc.program_version,
  };
}

function offChainLocatorToCanonical(loc: OffChainLocator): Record<string, unknown> {
  return {
    vm: null,
    off_chain_kind: loc.off_chain_kind,
    url: loc.url ?? null,
    domain: loc.domain ?? null,
    github_org: loc.github_org ?? null,
  };
}
