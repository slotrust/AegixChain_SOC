const fs = require('fs'); let c = fs.readFileSync('src/components/AegixBrain.tsx', 'utf8'); c = c.split('
').filter(line => !line.includes('AegixAssistant')).join('
'); fs.writeFileSync('src/components/AegixBrain.tsx', c);
