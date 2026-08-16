const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;

const ATERNOS_DOMAIN = "mundoeterno_etec.aternos.me";
const SRV_RECORD = `_minecraft._tcp.${ATERNOS_DOMAIN}`;

const PROXY_PORT = process.env.PORT || 10000;

const DNS_CACHE_TTL = 60 * 1000;

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
    res.status(200).send("Eaglercraft WSS Proxy online!");
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    proxyTimeout: 15000,
    timeout: 0
});

let cachedTarget = null;
let cachedAt = 0;
let dnsPromise = null;

async function getAternosTarget() {

    const now = Date.now();

    if (
        cachedTarget &&
        now - cachedAt < DNS_CACHE_TTL
    ) {
        return cachedTarget;
    }

    if (dnsPromise) {
        return dnsPromise;
    }

    dnsPromise = (async () => {

        try {

            const records = await dns.resolveSrv(SRV_RECORD);

            if (!records || records.length === 0) {
                throw new Error(
                    "Nenhum registro SRV encontrado."
                );
            }

            records.sort((a, b) => {

                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }

                return b.weight - a.weight;
            });

            const record = records[0];

            const hostname = record.name.replace(/\.$/, "");
            const port = record.port;

            cachedTarget = {
                hostname,
                port,
                target: `ws://${hostname}:${port}`
            };

            cachedAt = Date.now();

            console.log(
                `🔄 Aternos atualizado: ${hostname}:${port}`
            );

            return cachedTarget;

        } finally {

            dnsPromise = null;
        }

    })();

    return dnsPromise;
}

let activeConnections = 0;

server.on("upgrade", async (req, socket, head) => {

    activeConnections++;

    console.log("");
    console.log("========================================");
    console.log("📡 Nova conexão WebSocket recebida");
    console.log("========================================");

    try {

        const destination = await getAternosTarget();

        console.log(
            `🔗 Conectando em: ${destination.target}`
        );

        proxy.ws(
            req,
            socket,
            head,
            {
                target: destination.target,
                ws: true,
                changeOrigin: true,
                perMessageDeflate: false
            },
            (error) => {

                if (error) {

                    console.error(
                        "❌ Erro WebSocket:",
                        error.message
                    );

                }

                try {
                    socket.destroy();
                } catch {}
            }
        );

    } catch (error) {

        console.error(
            "❌ Erro DNS Aternos:",
            error.message
        );

        try {
            socket.destroy();
        } catch {}
    }

    socket.once("close", () => {
        activeConnections--;
    });
});

proxy.on("error", (err) => {

    console.error(
        "❌ Proxy:",
        err.message
    );

});

server.on("clientError", (err, socket) => {

    if (!socket.destroyed) {
        socket.destroy();
    }

});

setInterval(() => {

    console.log(
        `📊 Conexões ativas: ${activeConnections}`
    );

}, 60000);

function shutdown() {

    console.log("🛑 Encerrando proxy...");

    server.close(() => {

        console.log("✅ Proxy encerrado.");

        process.exit(0);

    });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(
    PROXY_PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log("========================================");
        console.log("🚀 Eaglercraft WSS Proxy iniciado");
        console.log("========================================");
        console.log(`Porta Render: ${PROXY_PORT}`);
        console.log(`Aternos: ${ATERNOS_DOMAIN}`);
        console.log(`SRV: ${SRV_RECORD}`);
        console.log("========================================");
    }
);
