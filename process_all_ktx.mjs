import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const PATH = `${process.cwd()}/ktx_expanded/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/usr/local/bin:${process.env.PATH}`;

const setDefsFile = 'visualizations/monolith/src/monolith/set-defs.js';
let content = fs.readFileSync(setDefsFile, 'utf8');

const regex = /(path|lowPath|mediumPath|piPath):\s*'([^']+)\.glb'/g;
let matches;
const uniqueModels = new Map();
const replacements = [];

while ((matches = regex.exec(content)) !== null) {
  const propName = matches[1];
  const glbPath = matches[2] + '.glb';
  const ktxPropName = propName === 'path' ? 'ktx2Path' : propName.replace('Path', 'Ktx2Path');
  const ktxPath = matches[2] + '.ktx2.glb';
  uniqueModels.set(glbPath, { origin: glbPath, target: ktxPath });
  
  const searchStr = `${propName}: '${glbPath}'`;
  if (!content.includes(`${ktxPropName}: '${ktxPath}'`)) {
    replacements.push({ searchStr, replaceStr: `${searchStr}, ${ktxPropName}: '${ktxPath}'` });
  }
}

console.log(`Found ${uniqueModels.size} unique models to process.`);

for (const { origin, target } of uniqueModels.values()) {
  const absoluteOrigin = path.join('public', origin);
  const absoluteTarget = path.join('public', target);
  
  if (!fs.existsSync(absoluteOrigin)) {
    console.log(`WARN: Source not found ${absoluteOrigin}`);
    continue;
  }
  
  if (fs.existsSync(absoluteTarget)) {
    console.log(`SKIP: Already compressed ${absoluteTarget}`);
  } else {
    console.log(`COMPRESSING: ${absoluteOrigin} -> ${absoluteTarget}`);
    try {
      execSync(`npx -y @gltf-transform/cli uastc "${absoluteOrigin}" "${absoluteTarget}"`, { 
        env: { ...process.env, PATH }, 
        stdio: 'inherit' 
      });
    } catch (e) {
      console.error(`ERROR compressing ${absoluteOrigin}`);
      continue;
    }
  }
  
  const monolithTarget = path.join('visualizations/monolith/public', target);
  fs.mkdirSync(path.dirname(monolithTarget), { recursive: true });
  fs.copyFileSync(absoluteTarget, monolithTarget);
  console.log(`MIRRORED: ${absoluteTarget} -> ${monolithTarget}`);
}

for (const { searchStr, replaceStr } of replacements) {
  content = content.replace(searchStr, replaceStr);
}

fs.writeFileSync(setDefsFile, content, 'utf8');
console.log('Finished updating set-defs.js');
