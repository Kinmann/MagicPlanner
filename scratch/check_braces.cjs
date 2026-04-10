const fs = require('fs');
const content = fs.readFileSync('src/components/Project/SadOverview.scss', 'utf8');
const lines = content.split('\n');
let balance = 0;
lines.forEach((line, i) => {
  for (let char of line) {
    if (char === '{') balance++;
    if (char === '}') balance--;
  }
  if (balance < 0) {
    console.log(`Extra closing brace at line ${i + 1}: ${line.trim()}`);
    balance = 0; // reset to find more
  }
});
if (balance > 0) {
  console.log(`Missing ${balance} closing brace(s) at end of file`);
}
