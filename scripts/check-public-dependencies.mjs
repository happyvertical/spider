import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const lockfile = await readFile('pnpm-lock.yaml', 'utf8');

const dependencies = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
  name.startsWith('@happyvertical/'),
);

const failures = [];

for (const name of dependencies) {
  const locked = findLockedPackage(name);

  if (!locked) {
    failures.push(`${name}: missing package entry in pnpm-lock.yaml`);
    continue;
  }

  const metadataUrl = `https://registry.npmjs.org/${name.replace('/', '%2f')}/${locked.version}`;
  const response = await fetch(metadataUrl);

  if (!response.ok) {
    failures.push(
      `${name}@${locked.version}: npmjs metadata returned ${response.status}`,
    );
    continue;
  }

  const metadata = await response.json();
  const publicIntegrity = metadata?.dist?.integrity;

  if (publicIntegrity !== locked.integrity) {
    failures.push(
      `${name}@${locked.version}: npmjs integrity ${publicIntegrity ?? '<missing>'} does not match lockfile ${locked.integrity}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    [
      'Public dependency mirror check failed.',
      'Publish @happyvertical dependencies to npmjs with byte-identical tarballs before publishing @happyvertical/spider.',
      '',
      ...failures.map((failure) => `- ${failure}`),
    ].join('\n'),
  );
  process.exit(1);
}

console.log('All @happyvertical runtime dependencies are available on npmjs with matching integrity.');

function findLockedPackage(name) {
  const packageLine = new RegExp(`^  '${escapeRegExp(name)}@([^']+)':$`);
  const lines = lockfile.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(packageLine);

    if (!match) {
      continue;
    }

    const version = match[1];
    const resolutionLine = lines
      .slice(index + 1, index + 8)
      .find((line) => line.trimStart().startsWith('resolution:'));
    const integrity = resolutionLine?.match(/integrity: ([^,}]+)/)?.[1];

    if (!integrity) {
      return undefined;
    }

    return { integrity, version };
  }

  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
