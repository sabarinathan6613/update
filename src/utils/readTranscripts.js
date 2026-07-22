// src/utils/readTranscripts.js
import fs from 'fs';
import path from 'path';

const logPath = 'C:\\Users\\sridh\\.gemini\\antigravity\\brain\\518d0722-b59c-42cd-9e7b-126290c43f8a\\.system_generated\\logs\\transcript.jsonl';

function search() {
  if (!fs.existsSync(logPath)) {
    console.error("Log file not found:", logPath);
    return;
  }
  
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');

  console.log("Searching transcripts for Trends.jsx content...");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      // We look for steps showing query logic, useEffect, or getHistorianData calls inside Trends.jsx before step 2600
      if (obj.step_index < 2700 && obj.content && obj.content.includes('Trends.jsx') && obj.content.includes('getHistorianData')) {
        console.log(`--- MATCH AT STEP ${obj.step_index} (type: ${obj.type}) ---`);
        console.log(obj.content.substring(0, 1500) + '...\n\n');
      }
    } catch (e) {
      // Ignored
    }
  }
}

search();
