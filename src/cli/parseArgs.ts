export interface CliArgs {
    rolePath: string;
    taskPath: string;
  }
  
  export function parseArgs(args: string[]): CliArgs {
    const roleIndex = args.indexOf("--role");
    const taskIndex = args.indexOf("--task");
  
    const rolePath = args[roleIndex + 1];
    const taskPath = args[taskIndex + 1];
  
    if (roleIndex === -1 || !rolePath) {
      throw new Error("Missing required --role argument");
    }
  
    if (taskIndex === -1 || !taskPath) {
      throw new Error("Missing required --task argument");
    }
  
    return {
      rolePath,
      taskPath,
    };
  }