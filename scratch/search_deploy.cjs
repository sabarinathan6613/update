const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\sridh\\.gemini\\antigravity\\brain\\84c62604-941e-4bf7-80d6-8b18a459c3b8\\.system_generated\\logs\\transcript.jsonl';

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log(`Total lines: ${lines.length}`);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('vercel') || line.includes('deploy') || line.includes('git push') || line.includes('git commit')) {
    try {
      const obj = JSON.parse(line);
      if (obj.tool_calls) {
        console.log(`Line ${i}: Tool Calls:`, JSON.stringify(obj.tool_calls));
      } else if (obj.content && obj.content.includes('CommandLine')) {
        console.log(`Line ${i}: Content:`, obj.content.substring(0, 300));
      }
    } catch (e) {
      // ignore
    }
  }
}
