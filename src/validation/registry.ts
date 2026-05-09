import type {
  ValidationRungHandler,
  ValidationHandlerRegistry,
  VmKind,
} from './tiers.js';
import type { ValidationRungName } from '../finding/schema.js';
import { RUNG_ORDER } from './tiers.js';

/**
 * In-process handler registry.
 *
 * The spine owns the interface; concrete tool runners (Foundry, Anchor, Soteria)
 * register themselves at the application layer (src/orchestrator/, src/router/)
 * — not here. This module only provides the registry contract and a default
 * implementation that shell-handlers throw through until binding occurs.
 *
 * VM-specific adapter files (src/validation/evm-bindings.ts, svm-bindings.ts)
 * call registry.register(...) at startup.
 */
export class InProcessValidationRegistry implements ValidationHandlerRegistry {
  private readonly handlers = new Map<string, ValidationRungHandler>();

  /** Register a handler for a specific (rung, vm) pair */
  register(rung: ValidationRungName, vm: VmKind, handler: ValidationRungHandler): void {
    this.handlers.set(registryKey(rung, vm), handler);
  }

  handlerFor(rung: ValidationRungName, vm: VmKind): ValidationRungHandler | null {
    return this.handlers.get(registryKey(rung, vm)) ?? null;
  }

  handlersForVm(vm: VmKind): ValidationRungHandler[] {
    return RUNG_ORDER
      .map(rung => this.handlers.get(registryKey(rung, vm)))
      .filter((h): h is ValidationRungHandler => h !== undefined);
  }
}

function registryKey(rung: ValidationRungName, vm: VmKind): string {
  return `${rung}::${vm}`;
}

/** Module-level default registry (singleton for the process) */
export const defaultRegistry = new InProcessValidationRegistry();
