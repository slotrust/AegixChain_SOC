import fs from 'fs';

const files = [
    'src/backend/services/edr_service.ts',
    'src/backend/services/aegix_bridge.ts',
    'src/backend/services/real_system_monitor.ts',
    'src/backend/services/sensor_bridge.ts',
    'src/backend/routes/edr.ts',
    'src/backend/routes/aegix.ts',
    'src/components/Chatbot.tsx',
    'src/components/VoiceAssistant.tsx'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/^ *console\.(log|error|warn)\(.*\);*$(\r\n|\r|\n)?/gm, '');
        fs.writeFileSync(file, content);
        console.log(`Removed logs from ${file}`);
    }
}
