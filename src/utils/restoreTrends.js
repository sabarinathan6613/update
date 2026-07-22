import fs from 'fs';

const logPath = 'C:\\Users\\sridh\\.gemini\\antigravity\\brain\\a1689e18-4814-4e8c-b817-215f165a063d\\.system_generated\\logs\\transcript_full.jsonl';
const targetPath = 'e:\\AI model\\src\\components\\Trends.jsx';

function restore() {
  if (!fs.existsSync(logPath)) {
    console.error("Log file not found:", logPath);
    return;
  }
  
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');

  console.log("Searching transcript for the last full view of Trends.jsx...");
  // Search from the end backwards to find the last complete view of Trends.jsx
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      // Check if it's a view_file output showing the entire file
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'view_file' && tc.args.AbsolutePath === targetPath) {
            // Check if it was returned in full or if we can extract it
            if (obj.content && obj.content.includes('File Path:')) {
              console.log(`Found complete file view at step_index: ${obj.step_index}`);
              // Extract the file content block between the showing header and bottom warning
              const match = obj.content.match(/Showing lines \d+ to \d+[\s\S]*?\n\d+:\s([\s\S]*?)\nThe above content/);
              if (match) {
                let code = match[1];
                // Remove line numbers (e.g. "123: const x = ...")
                const linesOfCode = code.split('\n').map(l => {
                  const m = l.match(/^\d+:\s?(.*)$/);
                  return m ? m[1] : l;
                });
                const cleanCode = linesOfCode.join('\n');
                console.log("Successfully extracted code! Writing to e:\\AI model\\src\\components\\Trends.jsx");
                fs.writeFileSync(targetPath, cleanCode, 'utf8');
                return;
              }
            }
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }
  console.log("Could not find a full Trends.jsx view in the transcript. Checking for partial replacements...");
}

restore();
