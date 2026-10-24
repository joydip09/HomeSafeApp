const fs = require('node:fs');
const path = require('node:path');

const packageJson = require.resolve('react-native-sqlite-storage/package.json');
const gradleFile = path.join(
  path.dirname(packageJson),
  'platforms/android/build.gradle',
);
const source = fs.readFileSync(gradleFile, 'utf8');
const patched = source.replace(
  /buildscript\s*\{[\s\S]*?\n\}\n\n(?=apply plugin)/,
  '',
);

if (patched !== source) fs.writeFileSync(gradleFile, patched);
