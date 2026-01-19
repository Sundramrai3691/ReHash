const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'styles.css',
  'content-leetcode.js',
  'content-codeforces.js'
];

console.log('Validating ReviseMate Chrome Extension...\n');

let allValid = true;

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} - MISSING`);
    allValid = false;
  }
});

if (allValid) {
  console.log('\n✓ All extension files present');
  console.log('✓ Build validation successful');
  process.exit(0);
} else {
  console.log('\n✗ Some files are missing');
  process.exit(1);
}
