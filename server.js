// server.js
const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');

// --- CRITICAL CONFIGURATION ---
// This is your Magmanodes server's address and dedicated port (34889)
const TARGET_HOST = 'mundoeterno_etec.aternos.me';
const TARGET_PORT = 49413;
const TARGET = `ws://${TARGET_HOST}:${TARGET_PORT}`;
// ------------------------------

const PROXY_PORT = process.env.PORT || 8080; // Northflank will use the PORT environment variable

const app = express();
const server = http.createServer(app);
const proxy = httpProxy.createProxyServer({
  target: TARGET,
  ws: true // Enable WebSocket proxying
});

// Handle upgrade requests for WebSockets
server.on('upgrade', (req, socket, head) => {
  console.log(`Proxying WebSocket request for: ${TARGET}`);
  proxy.ws(req, socket, head);
});

// Handle proxy errors to prevent the server from crashing
proxy.on('error', (err, req, res) => {
  console.error('Proxy Error:', err);
  if (res.writeHead) {
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
    res.end('Proxy Error: Could not connect to the upstream server.');
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`WSS Proxy listening on port ${PROXY_PORT} and forwarding to ${TARGET}`);
});
