import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface AgentScaffoldResult {
  agentId: string;
  createdPaths: string[];
  nextSteps: string[];
}

function identifiers(agentId: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(agentId)) {
    throw new Error("Agent ID must use lowercase kebab-case.");
  }
  const parts = agentId.split("-");
  const pascal = parts.map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
  return { camel: pascal[0]!.toLowerCase() + pascal.slice(1), pascal };
}

export async function scaffoldAgent(
  agentId: string,
  workspaceRoot = process.cwd(),
): Promise<AgentScaffoldResult> {
  const { camel, pascal } = identifiers(agentId);
  const agentDirectory = resolve(workspaceRoot, "src", "agents", agentId);
  const testsDirectory = resolve(workspaceRoot, "tests");
  await mkdir(agentDirectory, { recursive: true });
  await mkdir(testsDirectory, { recursive: true });

  const files = [
    {
      path: join(agentDirectory, `${camel}Agent.ts`),
      content: `import { z } from "zod";\nimport { defineAgent } from "../agentRegistration.js";\n\nexport const ${camel}InputSchema = z.object({\n  instruction: z.string().min(1),\n}).strict();\n\nexport const ${camel}OutputSchema = z.object({\n  summary: z.string().min(1),\n}).strict();\n\nexport const ${camel}Agent = defineAgent({\n  manifest: {\n    id: "${agentId}",\n    name: "${pascal}",\n    version: "0.1.0",\n    status: "experimental",\n    description: "Describe the agent's purpose.",\n    owner: "local-platform",\n    tags: ["learning"],\n    defaultModel: "gpt-5.4-mini",\n    components: { workflowIds: [], harnessIds: [], scenarioIds: [], datasetIds: [] },\n    permissions: { toolIds: [] },\n    verification: { datasetIds: ["${agentId}-smoke"], minimumPassRate: 1 },\n  },\n  inputSchema: ${camel}InputSchema,\n  outputSchema: ${camel}OutputSchema,\n  async execute(input) {\n    return { summary: input.instruction };\n  },\n  assess(output) {\n    return { passed: output.summary.length > 0, message: "Agent returned a summary." };\n  },\n});\n`,
    },
    {
      path: join(agentDirectory, `${camel}Dataset.ts`),
      content: `import { agentDatasetDefinitionSchema } from "../datasets/agentDatasetDefinition.js";\n\nexport const ${camel}Dataset = agentDatasetDefinitionSchema.parse({\n  id: "${agentId}-smoke",\n  description: "Initial smoke coverage for ${agentId}.",\n  agentId: "${agentId}",\n  cases: [{ id: "basic", input: { instruction: "Complete the basic task." } }],\n});\n`,
    },
    {
      path: join(testsDirectory, `${camel}Agent.test.ts`),
      content: `import { describe, expect, it } from "vitest";\nimport { ${camel}Agent, ${camel}InputSchema, ${camel}OutputSchema } from "../src/agents/${agentId}/${camel}Agent.js";\n\ndescribe("${pascal}", () => {\n  it("defines valid input, output, and manifest contracts", async () => {\n    const input = ${camel}InputSchema.parse({ instruction: "Test the agent." });\n    const output = await ${camel}Agent.execute(input, {} as never);\n    expect(${camel}OutputSchema.parse(output)).toEqual({ summary: "Test the agent." });\n    expect(${camel}Agent.manifest.id).toBe("${agentId}");\n  });\n});\n`,
    },
    {
      path: join(agentDirectory, "README.md"),
      content: `# ${pascal}\n\n## Purpose\n\nDescribe the user problem this agent owns.\n\n## Permissions\n\nExplain why every requested tool is necessary.\n\n## Success\n\nDefine what the assessment and verification dataset must prove.\n`,
    },
  ];

  for (const file of files) {
    try {
      await access(file.path);
      throw new Error(`Refusing to overwrite existing scaffold file: ${file.path}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  for (const file of files) {
    await writeFile(file.path, file.content, { encoding: "utf8", flag: "wx" });
  }

  return {
    agentId,
    createdPaths: files.map(({ path }) => path),
    nextSteps: [
      "Implement the agent workflow and assessment.",
      "Register the dataset in agentDatasetRegistry.ts.",
      "Register the agent in platformAgentRegistry.ts.",
      "Run npm run agents -- validate and npm test.",
    ],
  };
}
