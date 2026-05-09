import { z } from 'zod';

// ---------------------------------------------------------------------------
// Time anchors — VM-specific discriminated union
// ---------------------------------------------------------------------------

export const BlockHeightAnchorSchema = z.object({
  kind: z.literal('block_height'),
  value: z.number().int().nonnegative(),
});

export const SlotAnchorSchema = z.object({
  kind: z.literal('slot'),
  value: z.number().int().nonnegative(),
});

export const WallClockAnchorSchema = z.object({
  kind: z.literal('wall_clock'),
  value: z.string().datetime({ offset: true }),
});

const TimeAnchorSchema = z.discriminatedUnion('kind', [
  BlockHeightAnchorSchema,
  SlotAnchorSchema,
  WallClockAnchorSchema,
]);

export type TimeAnchor = z.infer<typeof TimeAnchorSchema>;

// ---------------------------------------------------------------------------
// EVM Locator
// ---------------------------------------------------------------------------

const ImplResolutionStrategySchema = z.enum([
  'static',
  'follow-eip1967',
  'follow-uups',
  'follow-diamond-loupe',
  'follow-beacon',
]);

const FacetSchema = z.object({
  selector: z.string(),
  implementation: z.string(),
});

const ImplResolutionSchema = z.object({
  strategy: ImplResolutionStrategySchema,
  resolved_implementation: z.string().optional(),
  resolved_at_block: z.number().int().nonnegative().optional(),
  facets: z.array(FacetSchema).optional(),
});

export const EvmLocatorSchema = z.object({
  vm: z.literal('evm'),
  chain_id: z.number().int().positive(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  time_anchor: BlockHeightAnchorSchema,
  implementation_resolution: ImplResolutionSchema,
  storage_layout_ref: z.string().optional(),
  deployer: z.string().optional(),
  creation_tx: z.string().optional(),
});

export type EvmLocator = z.infer<typeof EvmLocatorSchema>;

// ---------------------------------------------------------------------------
// SVM Locator
// ---------------------------------------------------------------------------

const InvolvedAccountSchema = z.object({
  pubkey: z.string().optional(),
  pubkey_role: z.string().optional(),
  type_name: z.string(),
  is_writable: z.boolean(),
  is_signer: z.boolean(),
});

export const SvmLocatorSchema = z.object({
  vm: z.literal('svm'),
  cluster: z.enum(['mainnet-beta', 'devnet', 'testnet']),
  program_id: z.string(),
  time_anchor: SlotAnchorSchema,
  program_version: z.string(),
  upgrade_authority: z.string().optional(),
  idl_ref: z.string().nullable().optional(),
  involved_accounts: z.array(InvolvedAccountSchema).default([]),
});

export type SvmLocator = z.infer<typeof SvmLocatorSchema>;

// ---------------------------------------------------------------------------
// Off-chain Locator (v0.1 extension)
// ---------------------------------------------------------------------------

const OffChainKindSchema = z.enum([
  'frontend',
  'rpc-endpoint',
  'ci-pipeline',
  'multisig-osint',
  'supply-chain',
  'bridge-validator-api',
  'community-admin',
]);

export const OffChainLocatorSchema = z.object({
  vm: z.null(),
  off_chain_kind: OffChainKindSchema,
  url: z.string().url().optional(),
  domain: z.string().optional(),
  github_org: z.string().optional(),
  ip_range: z.string().optional(),
  package_name: z.string().optional(),
  time_anchor: WallClockAnchorSchema,
  snapshot_uri: z.string().optional(),
});

export type OffChainLocator = z.infer<typeof OffChainLocatorSchema>;

// ---------------------------------------------------------------------------
// Secondary locator + Toolchain manifest
// ---------------------------------------------------------------------------

const AnyLocatorSchema = z.union([EvmLocatorSchema, SvmLocatorSchema, OffChainLocatorSchema]);
export type AnyLocator = z.infer<typeof AnyLocatorSchema>;

const CompilerSchema = z.object({
  name: z.enum(['solc', 'vyper', 'rustc', 'anchor-lang']),
  version: z.string(),
});

const ToolchainManifestSchema = z.object({
  compiler: CompilerSchema.optional(),
  compiler_settings: z.object({
    optimizer_enabled: z.boolean().optional(),
    optimizer_runs: z.number().int().nonnegative().optional(),
    via_ir: z.boolean().optional(),
    evm_version: z.string().optional(),
  }).optional(),
  build_framework: z.string().optional(),
  static_analyzers: z.array(z.object({ name: z.string(), version: z.string() })).optional(),
  fuzzers: z.array(z.object({ name: z.string(), version: z.string() })).optional(),
  model_invocations: z.array(z.object({
    agent_role: z.string(), model: z.string(), prompt_hash: z.string().optional(),
  })).optional(),
});

export type ToolchainManifest = z.infer<typeof ToolchainManifestSchema>;

// ---------------------------------------------------------------------------
// Subject (per-VM discriminated union + off-chain v0.1)
// ---------------------------------------------------------------------------

const LogicalSubjectSchema = z.enum([
  'diamond', 'proxy', 'single-contract', 'multi-program-system',
  'frontend', 'rpc-endpoint', 'ci-pipeline',
]);

const SourceFormatSchema = z.enum([
  'verified_source', 'decompiled_bytecode', 'raw_bytecode',
  'anchor_idl_only', 'move_published', 'frontend_bundle', 'rpc_introspection',
]);

const baseSubjectFields = {
  secondary_locators: z.array(AnyLocatorSchema).optional(),
  logical_subject: LogicalSubjectSchema.optional(),
  source_format: SourceFormatSchema.optional(),
  source_artifact_uri: z.string().optional(),
  toolchain_manifest: ToolchainManifestSchema.optional(),
};

export const SubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('evm'), primary_locator: EvmLocatorSchema, ...baseSubjectFields }),
  z.object({ kind: z.literal('svm'), primary_locator: SvmLocatorSchema, ...baseSubjectFields }),
  z.object({
    kind: z.literal('off-chain'),
    primary_locator: OffChainLocatorSchema,
    ...baseSubjectFields,
    scope_artifact_id: z.string(), // mandatory for off-chain
  }),
]);

export type Subject = z.infer<typeof SubjectSchema>;
