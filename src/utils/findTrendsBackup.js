import fs from 'fs';

const logPath = 'C:\\Users\\sridh\\.gemini\\antigravity\\brain\\a1689e18-4814-4e8c-b817-215f165a063d\\.system_generated\\logs\\transcript_full.jsonl';

function find() {
  if (!fs.existsSync(logPath)) {
    console.error("Log file not found:", logPath);
    return;
  }
  
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');

  console.log("Searching transcript for Trends.jsx query block...");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.content && obj.content.includes('getRecordsInRange') && obj.content.includes('latestRows') && obj.content.includes('Trends.jsx')) {
        console.log(`--- MATCH AT STEP ${obj.step_index} ---`);
        // Find the lines of Trends.jsx
        const linesOfContent = obj.content.split('\n');
        const startIdx = linesOfContent.findIndex(l => l.includes('Fetch historian data'));
        if (startIdx !== -1) {
          console.log(linesOfContent.slice(startIdx, startIdx + 120).join('\n'));
          console.log('\n======================================\n');
        }
      }
    } catch (e) {
      // Ignored
    }
  }
}

find();
