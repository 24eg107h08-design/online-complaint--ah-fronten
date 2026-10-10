const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = '127.0.0.1';
const port = Number(process.env.PORT) || 5500;
const root = __dirname;
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((request, response) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    } catch {
        response.writeHead(400);
        response.end('Bad Request');
        return;
    }

    const relativePath = pathname === '/' ? 'index.html' : `.${pathname}`;
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
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
        fs.createReadStream(filePath).pipe(response);
    });
});

server.listen(port, host, () => {
    console.log(`Frontend available at http://${host}:${port}`);
});
