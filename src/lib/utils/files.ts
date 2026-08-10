import { createHash } from "crypto";
import { readdir, stat } from "fs/promises";
import path from "path";

export type ManifestEntry = {
  path: string;
  size: number;
  sha256: string;
};

export async function walkFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(root, fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat();
}

export async function createManifest(root: string): Promise<ManifestEntry[]> {
  const files = await walkFiles(root);
  return Promise.all(
    files.map(async (file) => {
      const stats = await stat(file);
      const buffer = await import("fs/promises").then((fs) => fs.readFile(file));
      return {
        path: path.relative(root, file).split(path.sep).join("/"),
        size: stats.size,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    })
  );
}

export function manifestTotals(manifest: ManifestEntry[]) {
  return {
    fileCount: manifest.length,
    sizeBytes: manifest.reduce((sum, entry) => sum + entry.size, 0),
  };
}
