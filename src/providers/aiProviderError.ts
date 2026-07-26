export type AIProviderErrorCategory =
| "transport"
| "parsing";

export class AIProviderError extends Error {
constructor(
  public readonly category: AIProviderErrorCategory,
  message: string,
) {
  super(message);
  this.name = "AIProviderError";
}
}