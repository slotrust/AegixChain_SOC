import fs from 'fs';
try {
  if (fs.existsSync('build')) {
    const stat = fs.lstatSync('build');
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      fs.rmSync('build', { recursive: true, force: true });
      console.log('Removed build');
    }
  }
} catch(e) {
  console.error(e);
}
