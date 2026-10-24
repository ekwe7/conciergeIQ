import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modulesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/modules');

interface SourceImport {
  file: string;
  specifier: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function importsOf(file: string): SourceImport[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from '([^']+)'/g)].map((match) => ({ file, specifier: match[1]! }));
}

/** `rooms` for any file under src/modules/rooms/. */
function moduleOf(path: string): string | undefined {
  const [first] = relative(modulesDir, path).split('/');
  return first && !first.startsWith('..') ? first : undefined;
}

const allImports = sourceFiles(modulesDir).flatMap(importsOf);
const describeImport = ({ file, specifier }: SourceImport) => `${relative(modulesDir, file)} imports '${specifier}'`;

describe('Module boundaries', () => {
  it("modules use each other only through the other module's index.ts", () => {
    const violations = allImports.filter(({ file, specifier }) => {
      if (!specifier.startsWith('.')) return false;
      const target = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
      const targetModule = moduleOf(target);
      const crossesModules = targetModule !== undefined && targetModule !== moduleOf(file);
      return crossesModules && target !== join(modulesDir, targetModule, 'index.ts');
    });

    expect(violations.map(describeImport)).toEqual([]);
  });

  it('domain code has no framework or database imports', () => {
    const infrastructurePackages = /^(fastify|@fastify\/|drizzle-orm|postgres$|pdfkit|qrcode)/;
    const violations = allImports.filter(
      ({ file, specifier }) => file.includes('/domain/') && infrastructurePackages.test(specifier),
    );

    expect(violations.map(describeImport)).toEqual([]);
  });

  it('application code reaches the database only through infrastructure', () => {
    const violations = allImports.filter(
      ({ file, specifier }) => file.includes('/application/') && /^(drizzle-orm|postgres$)/.test(specifier),
    );

    expect(violations.map(describeImport)).toEqual([]);
  });
});
