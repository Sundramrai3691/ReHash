import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  const relativePath = requestUrl.pathname === "/"
    ? "/local/popup-preview.html"
    : requestUrl.pathname;
  const filePath = path.normalize(path.join(projectRoot, relativePath));

  if (!filePath.startsWith(projectRoot)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = mimeTypes[extension] || "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Local preview running at http://${host}:${port}/`);
  console.log(`Popup preview: http://${host}:${port}/local/popup-preview.html`);
});
