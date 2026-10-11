const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleApiRequest } = require('./backend');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 5500;
const root = __dirname;
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (request, response) => {
    if (request.url && new URL(request.url, `http://${host}`).pathname.startsWith('/api/')) {
        await handleApiRequest(request, response);
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    } catch {
        response.writeHead(400);
        response.end('Bad Request');
        return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end('Method Not Allowed');
        return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = path.resolve(root, relativePath);
    const relativeToRoot = path.relative(root, filePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) ||
        relativeToRoot === 'server.js' || relativeToRoot === 'backend.js' ||
        relativeToRoot.split(path.sep).some(part => part.startsWith('.') || part === 'uploads' || part === 'test')) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) {
            response.writeHead(404);
            response.end('Not Found');
            return;
        }

        response.writeHead(200, {
            'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff'
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        fs.createReadStream(filePath).pipe(response);
    });
});

if (require.main === module) {
    server.listen(port, host, () => {
        console.log(`Complaint portal and API available at http://${host}:${port}`);
        console.log('Demo accounts: admin@cms.com / admin123 and user@cms.com / user123');
    });
}

module.exports = server;
