import { basename, extname } from "node:path";

export function getFileId(filePath: string): string {
  const extension = extname(filePath);

  return basename(filePath, extension);
}