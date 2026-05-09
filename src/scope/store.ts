import type { ScopeArtifact } from './artifact.js';

/**
 * Scope artifact store — port interface (owned by the scope domain).
 * Persistence adapter lives in src/store/.
 */
export interface ScopeArtifactStore {
  findById(id: string): Promise<ScopeArtifact | null>;
  create(artifact: ScopeArtifact): Promise<ScopeArtifact>;
}

/** In-memory implementation for testing */
export class InMemoryScopeStore implements ScopeArtifactStore {
  private readonly store = new Map<string, ScopeArtifact>();

  async findById(id: string): Promise<ScopeArtifact | null> {
    return this.store.get(id) ?? null;
  }

  async create(artifact: ScopeArtifact): Promise<ScopeArtifact> {
    this.store.set(artifact.id, artifact);
    return artifact;
  }
}
