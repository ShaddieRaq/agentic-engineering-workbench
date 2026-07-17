export interface AIProvider {
    generateText(input: string): Promise<string>;
  }