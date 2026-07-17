import type { AIProvider } from "./aiProvider.js";

export class FakeProvider implements AIProvider {
  constructor(private readonly response: string) {}

  async generateText(_input: string): Promise<string> {
    return this.response;
  }
}