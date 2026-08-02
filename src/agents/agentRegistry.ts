import type { AgentManifest } from "./agentManifest.js";
import type { AgentRegistration } from "./agentRegistration.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);

    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

export class AgentRegistry {
  readonly #registrations: ReadonlyMap<string, AgentRegistration>;

  constructor(registrations: readonly AgentRegistration[]) {
    const entries = registrations.map((registration) => {
      deepFreeze(registration.manifest);
      return [registration.manifest.id, registration] as const;
    });
    const ids = entries.map(([id]) => id);

    if (new Set(ids).size !== ids.length) {
      throw new Error("Agent IDs must be unique.");
    }

    this.#registrations = new Map(entries);
  }

  get(id: string): AgentRegistration {
    const registration = this.#registrations.get(id);

    if (!registration) {
      throw new Error(`Unknown agent: ${id}`);
    }

    return registration;
  }

  find(id: string): AgentRegistration | undefined {
    return this.#registrations.get(id);
  }

  list(): AgentManifest[] {
    return [...this.#registrations.values()]
      .map(({ manifest }) => manifest)
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
