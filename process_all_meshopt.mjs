import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Find all public/ ktx2 glbs
function findKtx2Files(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findKtx2Files(filePath, fileList);
    } else if (filePath.endsWith('.ktx2.glb')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const ktx2Files = findKtx2Files('public');
console.log(`Found ${ktx2Files.length} KTX2 files to meshopt compress.`);

for (const filePath of ktx2Files) {
  // Compress in place (overwrite)
  console.log(`COMPRESSING: ${filePath}`);
  try {
    execSync(`npx -y @gltf-transform/cli meshopt "${filePath}" "${filePath}"`, { 
      stdio: 'inherit' 
    });
  } catch (e) {
    console.error(`ERROR computing meshopt on ${filePath}`);
    continue;
  }
  
  // Mirror to Monolith submodule
  const monolithTarget = path.join('visualizations/monolith/public', path.relative('public', filePath));
  if (fs.existsSync(path.dirname(monolithTarget))) {
    fs.copyFileSync(filePath, monolithTarget);
    console.log(`MIRRORED: ${filePath} -> ${monolithTarget}`);
  }
}

console.log('Finished meshopt compression.');
