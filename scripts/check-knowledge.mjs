// CI guard: knowledge.md must be an exact mirror of AGENTS.md.
import { readFileSync } from 'node:fs';

const agents = readFileSync('AGENTS.md', 'utf8');
const knowledge = readFileSync('knowledge.md', 'utf8');
if (agents !== knowledge) {
  console.error('knowledge.md differs from AGENTS.md. Run: cp AGENTS.md knowledge.md');
  process.exit(1);
}
console.log('knowledge.md mirrors AGENTS.md');
