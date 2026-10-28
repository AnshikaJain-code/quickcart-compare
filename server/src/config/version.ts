import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Reads the version from server/package.json (works from src/ and dist/). */
export function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
