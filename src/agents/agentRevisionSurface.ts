import { z, type ZodType } from "zod";
import type { AgentRegistration } from "./agentRegistration.js";

type JsonValue = z.infer<ReturnType<typeof z.json>>;
export type RevisionPolicy = Record<string, JsonValue>;

export interface AgentRevisionSurface<
  TPolicy extends RevisionPolicy = RevisionPolicy,
> {
  schema: ZodType<TPolicy>;
  baselinePolicy: Readonly<TPolicy>;
  mutableFields: readonly Extract<keyof TPolicy, string>[];
  createCandidate(policy: unknown): AgentRegistration;
}

export interface AgentRevisionSurfaceDefinition<TPolicy extends RevisionPolicy> {
  schema: ZodType<TPolicy>;
  baselinePolicy: TPolicy;
  mutableFields: readonly Extract<keyof TPolicy, string>[];
  createCandidate(policy: TPolicy): AgentRegistration;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function defineAgentRevisionSurface<TPolicy extends RevisionPolicy>(
  definition: AgentRevisionSurfaceDefinition<TPolicy>,
): AgentRevisionSurface<TPolicy> {
  const baselinePolicy = definition.schema.parse(definition.baselinePolicy);
  const mutableFields = [...definition.mutableFields];

  if (mutableFields.length === 0) {
    throw new Error("Agent revision surfaces require at least one mutable field.");
  }
  if (new Set(mutableFields).size !== mutableFields.length) {
    throw new Error("Agent revision surface mutable fields must be unique.");
  }

  const baselineFields = Object.keys(baselinePolicy);
  const allowedFields = new Set<string>(mutableFields);
  const unknownMutableFields = mutableFields.filter(
    (field) => !Object.hasOwn(baselinePolicy, field),
  );
  if (unknownMutableFields.length > 0) {
    throw new Error(
      `Agent revision surface declares fields absent from baseline policy: ${unknownMutableFields.join(", ")}.`,
    );
  }
  const undeclaredBaselineFields = baselineFields.filter(
    (field) => !allowedFields.has(field),
  );
  if (undeclaredBaselineFields.length > 0) {
    throw new Error(
      `Agent revision surface baseline contains undeclared mutable fields: ${undeclaredBaselineFields.join(", ")}.`,
    );
  }

  return {
    schema: definition.schema,
    baselinePolicy: deepFreeze(baselinePolicy),
    mutableFields: Object.freeze(mutableFields),
    createCandidate(policy) {
      return definition.createCandidate(definition.schema.parse(policy));
    },
  };
}
