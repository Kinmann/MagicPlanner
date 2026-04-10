const fs = require('fs');
const content = fs.readFileSync('src/components/Project/SadOverview.scss', 'utf8');
const lines = content.split('\n');
let balance = 0;
lines.forEach((line, i) => {
  let lineBalance = 0;
  for (let char of line) {
    if (char === '{') { balance++; lineBalance++; }
    if (char === '}') { balance--; lineBalance--; }
  }
  console.log(`${(i + 1).toString().padStart(3)} | ${balance} | ${line.trim()}`);
});
