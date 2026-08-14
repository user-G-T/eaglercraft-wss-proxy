const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const ATERNOS_DOMAIN = "mundoeterno_etec.aternos.me";
const SRV_RECORD = `_minecraft._tcp.${ATERNOS_DOMAIN}`;

const PROXY_PORT = process.env.PORT || 10000;

// Tempo que o resultado DNS fica em cache.
// 60 segundos é suficiente para detectar rapidamente
// uma mudança do servidor Aternos sem consultar DNS
// a cada jogador.
const DNS_CACHE_TTL = 60 * 1000;

// Intervalo de heartbeat.
// Serve para detectar conexões mortas.
const HEARTBEAT_INTERVAL = 30 * 1000;

// =====================================================
// HTTP
// =====================================================

const app = express();

const server = http.createServer(app);

app.get("/", (req, res) => {
    res.status(200).send("Eaglercraft WSS Proxy online!");
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

// =====================================================
// PROXY
// =====================================================

const proxy = httpProxy.createProxyServer({
    ws: true,

    // O destino Aternos não precisa receber o Host
    // original do Render.
    changeOrigin: true,

    // Não queremos que o proxy fique esperando
    // indefinidamente por uma conexão.
    proxyTimeout: 15000,

    // Timeout do socket de entrada.
    timeout: 0
});

// =====================================================
// CACHE DO ATERNOS
// =====================================================

let cachedTarget = null;
let cachedAt = 0;

let dnsPromise = null;

async function getAternosTarget() {

    const now = Date.now();

    // -------------------------------------------------
    // CACHE
    // -------------------------------------------------

    if (
        cachedTarget &&
        now - cachedAt < DNS_CACHE_TTL
    ) {
        return cachedTarget;
    }

    // -------------------------------------------------
    // EVITAR CONSULTAS DNS SIMULTÂNEAS
    // -------------------------------------------------

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

            // Prioridade menor = melhor.
            // Dentro da mesma prioridade,
            // usamos o maior weight disponível.
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

// =====================================================
// CONEXÕES ATIVAS
// =====================================================

let activeConnections = 0;

// =====================================================
// WEBSOCKET
// =====================================================

server.on("upgrade", async (req, socket, head) => {

    activeConnections++;

    try {

        const destination = await getAternosTarget();

        proxy.ws(
            req,
            socket,
            head,
            {
                target: destination.target,
                ws: true,
                changeOrigin: true,

                // Não adicionamos compressão no proxy.
                // O EaglerXServer já possui suas próprias
                // limitações de compressão.
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

    socket.once("error", () => {
        activeConnections--;
    });
});

// =====================================================
// ERROS DO PROXY
// =====================================================

proxy.on("error", (err) => {

    console.error(
        "❌ Proxy:",
        err.message
    );

});

// =====================================================
// ERROS HTTP
// =====================================================

server.on("clientError", (err, socket) => {

    if (!socket.destroyed) {
        socket.destroy();
    }

});

// =====================================================
// STATUS
// =====================================================

setInterval(() => {

    console.log(
        `📊 Conexões ativas: ${activeConnections}`
    );

}, 60000);

// =====================================================
// SHUTDOWN
// =====================================================

function shutdown() {

    console.log("🛑 Encerrando proxy...");

    server.close(() => {

        console.log("✅ Proxy encerrado.");

        process.exit(0);

    });

}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// =====================================================
// INICIAR
// =====================================================

server.listen(
    PROXY_PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log("========================================");
        console.log("🚀 EAGLERCRAFT WSS PROXY");
        console.log("========================================");
        console.log(`Porta: ${PROXY_PORT}`);
        console.log(`Aternos: ${ATERNOS_DOMAIN}`);
        console.log(`SRV: ${SRV_RECORD}`);
        console.log("========================================");
        console.log("");
    }
);
