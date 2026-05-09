import type { Heuristic, TenantVisibility } from './schema.js';

// ---------------------------------------------------------------------------
// Port interface — the spine owns this; adapters implement it
// (Dependency Rule: store.ts is domain code; Postgres client lives in src/store/)
// ---------------------------------------------------------------------------

export interface HeuristicQuery {
  vmScope?: 'evm' | 'svm' | 'off-chain';
  category?: string;
  status?: Heuristic['status'];
  tenantVisibility?: TenantVisibility;
  tenantId?: string;
  deprecated?: boolean;
}

export interface HeuristicStore {
  /** Persist a new heuristic (insert) */
  create(heuristic: Heuristic): Promise<Heuristic>;

  /** Update an existing heuristic (upsert by id + version) */
  update(heuristic: Heuristic): Promise<Heuristic>;

  /** Retrieve by stable ID and specific version */
  findByIdAndVersion(id: string, version: number): Promise<Heuristic | null>;

  /** Retrieve all versions of a heuristic by stable ID */
  findAllVersions(id: string): Promise<Heuristic[]>;

  /** Query heuristics matching the given criteria */
  query(q: HeuristicQuery): Promise<Heuristic[]>;

  /**
   * Three-pool access: returns heuristics visible to a specific tenant.
   * Visibility is: public (all) + shared-pool (opt-in tenants) + private-tenant (own only).
   */
  queryForTenant(tenantId: string, baseQuery?: Omit<HeuristicQuery, 'tenantId' | 'tenantVisibility'>): Promise<Heuristic[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementation for testing (not for production)
// ---------------------------------------------------------------------------

export class InMemoryHeuristicStore implements HeuristicStore {
  private readonly store = new Map<string, Heuristic>();

  private storeKey(id: string, version: number): string {
    return `${id}@v${version}`;
  }

  async create(heuristic: Heuristic): Promise<Heuristic> {
    const key = this.storeKey(heuristic.id, heuristic.version);
    if (this.store.has(key)) {
      throw new Error(`Heuristic ${key} already exists`);
    }
    this.store.set(key, heuristic);
    return heuristic;
  }

  async update(heuristic: Heuristic): Promise<Heuristic> {
    const key = this.storeKey(heuristic.id, heuristic.version);
    this.store.set(key, heuristic);
    return heuristic;
  }

  async findByIdAndVersion(id: string, version: number): Promise<Heuristic | null> {
    return this.store.get(this.storeKey(id, version)) ?? null;
  }

  async findAllVersions(id: string): Promise<Heuristic[]> {
    return [...this.store.values()].filter(h => h.id === id);
  }

  async query(q: HeuristicQuery): Promise<Heuristic[]> {
    return [...this.store.values()].filter(h => matchesQuery(h, q));
  }

  async queryForTenant(
    tenantId: string,
    baseQuery?: Omit<HeuristicQuery, 'tenantId' | 'tenantVisibility'>,
  ): Promise<Heuristic[]> {
    return [...this.store.values()].filter(h => {
      const visibilityOk =
        h.tenant_visibility === 'public' ||
        h.tenant_visibility === 'shared-pool' ||
        (h.tenant_visibility === 'private-tenant' && h.tenant_id === tenantId);
      return visibilityOk && matchesQuery(h, baseQuery ?? {});
    });
  }
}

function matchesQuery(heuristic: Heuristic, q: HeuristicQuery): boolean {
  if (q.vmScope && !heuristic.vm_scope.includes(q.vmScope)) return false;
  if (q.category && heuristic.category !== q.category) return false;
  if (q.status && heuristic.status !== q.status) return false;
  if (q.tenantVisibility && heuristic.tenant_visibility !== q.tenantVisibility) return false;
  if (q.tenantId && heuristic.tenant_id !== q.tenantId) return false;
  if (q.deprecated !== undefined && heuristic.deprecated !== q.deprecated) return false;
  return true;
}
