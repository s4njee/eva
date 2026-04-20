import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const setDefsFile = 'visualizations/monolith/src/monolith/set-defs.js';
let content = fs.readFileSync(setDefsFile, 'utf8');

// Find all unique base paths
const regex = /path:\s*'([^']+)\.ktx2\.glb'/g;
let matches;
const uniqueModels = new Map();

// Track which models we need to process
while ((matches = regex.exec(content)) !== null) {
  const baseName = matches[1]; // '/set1/astolfo'
  
  // if it's already a .low or .medium, skip
  if (baseName.endsWith('.low') || baseName.endsWith('.medium')) {
    continue;
  }
  
  // Check if mediumPath / lowPath properties are already wired inside this entry.
  // E.g. eva01running already has them.
  uniqueModels.set(baseName, { baseName });
}

// 1. Process all LODs
console.log(`Starting LOD generation for ${uniqueModels.size} models...`);

for (const baseName of uniqueModels.keys()) {
  const absoluteBase = path.join('public', `${baseName}.ktx2.glb`);
  
  if (!fs.existsSync(absoluteBase)) {
    console.log(`WARN: Source not found ${absoluteBase}. Skipping.`);
    continue;
  }
  
  // Medium
  const medTmp = path.join('public', `${baseName}.medium.tmp.glb`);
  const medOut = path.join('public', `${baseName}.medium.ktx2.glb`);
  const medMirror = path.join('visualizations/monolith/public', `${baseName}.medium.ktx2.glb`);
  
  if (!fs.existsSync(medOut)) {
    console.log(`+ GENERATING: ${medOut}`);
    try {
      execSync(`npx -y @gltf-transform/cli simplify "${absoluteBase}" "${medTmp}" --ratio 0.6 --error 0.001`, { stdio: 'inherit' });
      execSync(`npx -y @gltf-transform/cli meshopt "${medTmp}" "${medOut}"`, { stdio: 'inherit' });
      fs.copyFileSync(medOut, medMirror);
    } catch (e) {
      console.error(`- FAILED generating medium for ${baseName}`);
    }
    if (fs.existsSync(medTmp)) fs.rmSync(medTmp);
  } else {
    console.log(`= SKIPPING: ${medOut} already exists.`);
  }

  // Low
  const lowTmp = path.join('public', `${baseName}.low.tmp.glb`);
  const lowOut = path.join('public', `${baseName}.low.ktx2.glb`);
  const lowMirror = path.join('visualizations/monolith/public', `${baseName}.low.ktx2.glb`);
  
  if (!fs.existsSync(lowOut)) {
    console.log(`+ GENERATING: ${lowOut}`);
    try {
      execSync(`npx -y @gltf-transform/cli simplify "${absoluteBase}" "${lowTmp}" --ratio 0.45 --error 0.002`, { stdio: 'inherit' });
      execSync(`npx -y @gltf-transform/cli meshopt "${lowTmp}" "${lowOut}"`, { stdio: 'inherit' });
      fs.copyFileSync(lowOut, lowMirror);
    } catch (e) {
      console.error(`- FAILED generating low for ${baseName}`);
    }
    if (fs.existsSync(lowTmp)) fs.rmSync(lowTmp);
  } else {
    console.log(`= SKIPPING: ${lowOut} already exists.`);
  }
}

// 2. Wire up set-defs.js
const replacements = [];
for (const baseName of uniqueModels.keys()) {
  const searchStr = `path: '${baseName}.ktx2.glb'`;
  
  if (!content.includes(`mediumPath: '${baseName}.medium.ktx2.glb'`)) {
     replacements.push({
       searchStr: searchStr,
       replaceStr: `${searchStr}, mediumPath: '${baseName}.medium.ktx2.glb', lowPath: '${baseName}.low.ktx2.glb'`
     });
  }
}

for (const { searchStr, replaceStr } of replacements) {
  content = content.replace(searchStr, replaceStr);
}
fs.writeFileSync(setDefsFile, content, 'utf8');

console.log('LOD batch generation complete! set-defs.js has been updated.');
