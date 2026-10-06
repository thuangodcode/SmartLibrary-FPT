const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk('d:/SmartLibrary-FPT/apps/web/src');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    
    // Replace single quotes: 'http://localhost:5278/api/v1/auth/login' -> `${import.meta.env.VITE_API_URL}/api/v1/auth/login`
    if (content.includes("'http://localhost:5278")) {
        content = content.replace(/'http:\/\/localhost:5278([^']*)'/g, '`${import.meta.env.VITE_API_URL}$1`');
        changed = true;
    }
    
    // Check if there are backtick usages: `http://localhost:5278/api/v1/readers?${params.toString()}` -> `${import.meta.env.VITE_API_URL}/api/v1/readers?${params.toString()}`
    if (content.includes("`http://localhost:5278")) {
        content = content.replace(/`http:\/\/localhost:5278([^`]*)`/g, '`${import.meta.env.VITE_API_URL}$1`');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(file, content, 'utf8');
    }
});
