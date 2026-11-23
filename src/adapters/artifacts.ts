import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeArtifact(name: string, value: unknown): Promise<string> {
  const base = process.env.RUNNER_TEMP
    ? path.join(process.env.RUNNER_TEMP, 'repo-arbiter')
    : path.join(process.cwd(), '.repo-arbiter');
  await mkdir(base, { recursive: true });
  const target = path.join(base, name);
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(target, content, 'utf8');
  return target;
}
