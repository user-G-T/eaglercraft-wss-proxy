```js
const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const ATERNOS_HOST =
    process.env.ATERNOS_HOST || "mundoeterno_etec.aternos.me";

const ATERNOS_PORT =
    Number(process.env.ATERNOS_PORT) || 49413;

const FALIX_HOST =
    process.env.FALIX_HOST || "mundoeternoetec.falix.me";

const FALIX_PORT =
    Number(process.env.FALIX_PORT) || 22899;

const PORT =
    Number(process.env.PORT) || 10000;


// =====================================================
// SERVIDOR HTTP
// =====================================================

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
    res.status(200).send("Eaglercraft WSS Proxy - Aternos + Falix");
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});


// =====================================================
// PROXY WEBSOCKET
// =====================================================

const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    proxyTimeout: 10000,
    timeout: 15000,
    perMessageDeflate: false
});


// =====================================================
// RESOLVER DNS
// =====================================================

async function resolveHost(host) {
    try {
        const addresses = await dns.resolve4(host);

        if (!addresses || addresses.length === 0) {
            throw new Error("Nenhum IP encontrado para " + host);
        }

        return addresses;

    } catch (error) {
        throw new Error(
            "Erro ao resolver " + host + ": " + error.message
        );
    }
}


// =====================================================
// OBTER DESTINOS
// =====================================================

async function getTargets() {
    const targets = [];

    // -------------------------------------------------
    // FALIX
    // -------------------------------------------------

    console.log("");
    console.log("========================================");
    console.log("🔎 PROCURANDO FALIX");
    console.log("========================================");

    try {
        const ips = await resolveHost(FALIX_HOST);

        for (const ip of ips) {
            console.log(
                "📡 Falix encontrado: " +
                ip +
                ":" +
                FALIX_PORT
            );

            targets.push({
                provider: "Falix",
                host: FALIX_HOST,
                ip: ip,
                port: FALIX_PORT
            });
        }

    } catch (error) {
        console.log("⚠️ Falix indisponível:");
        console.log(error.message);
    }


    // -------------------------------------------------
    // ATERNOS
    // -------------------------------------------------

    console.log("");
    console.log("========================================");
    console.log("🔎 PROCURANDO ATERNOS");
    console.log("========================================");

    try {
        const ips = await resolveHost(ATERNOS_HOST);

        for (const ip of ips) {
            console.log(
                "📡 Aternos encontrado: " +
                ip +
                ":" +
                ATERNOS_PORT
            );

            targets.push({
                provider: "Aternos",
                host: ATERNOS_HOST,
                ip: ip,
                port: ATERNOS_PORT
            });
        }

    } catch (error) {
        console.log("⚠️ Aternos indisponível:");
        console.log(error.message);
    }

    return targets;
}


// =====================================================
// TESTE TCP
// =====================================================

function testTCP(ip, port, timeout = 8000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        let finished = false;

        function finish(result) {
            if (finished) {
                return;
            }

            finished = true;

            try {
                socket.destroy();
            } catch (_) {}

            resolve(result);
        }

        socket.setTimeout(timeout);

        socket.connect(port, ip, () => {
            console.log(
                "🟢 TCP OK: " +
                ip +
                ":" +
                port
            );

            finish(true);
        });

        socket.on("timeout", () => {
            console.log(
                "🔴 TCP TIMEOUT: " +
                ip +
                ":" +
                port
            );

            finish(false);
        });

        socket.on("error", (error) => {
            console.log(
                "🔴 TCP ERRO: " +
                ip +
                ":" +
                port +
                " -> " +
                (error.code || error.message)
            );

            finish(false);
        });
    });
}


// =====================================================
// ENCONTRAR SERVIDOR ONLINE
// =====================================================

async function findWorkingServer() {
    const targets = await getTargets();

    if (targets.length === 0) {
        throw new Error(
            "Nenhum servidor foi encontrado."
        );
    }

    console.log("");
    console.log("========================================");
    console.log("🧪 TESTANDO SERVIDORES");
    console.log("========================================");

    // Falix é testado primeiro.
    // Se estiver offline, tenta Aternos.

    for (const target of targets) {
        console.log("");
        console.log(
            "🔎 Testando " +
            target.provider +
            "..."
        );

        const online = await testTCP(
            target.ip,
            target.port
        );

        if (online) {
            console.log("");
            console.log("========================================");
            console.log(
                "🟢 " +
                target.provider +
                " ONLINE"
            );
            console.log("========================================");

            return target;
        }
    }

    throw new Error(
        "Falix e Aternos foram encontrados, mas nenhum está aceitando conexões."
    );
}


// =====================================================
// CONEXÕES
// =====================================================

let connections = 0;


// =====================================================
// WEBSOCKET EAGLERCRAFT
// =====================================================

server.on(
    "upgrade",
    async (req, socket, head) => {

        connections++;

        console.log("");
        console.log("========================================");
        console.log("📡 NOVA CONEXÃO EAGLERCRAFT");
        console.log("========================================");

        try {
            const target = await findWorkingServer();

            console.log("");
            console.log(
                "🔗 Encaminhando para " +
                target.provider
            );

            console.log(
                target.ip +
                ":" +
                target.port
            );

            proxy.ws(
                req,
                socket,
                head,
                {
                    target:
                        "ws://" +
                        target.ip +
                        ":" +
                        target.port,

                    ws: true,
                    changeOrigin: true,
                    perMessageDeflate: false
                },
                (error) => {

                    if (error) {
                        console.error(
                            "❌ Erro WebSocket: " +
                            error.message
                        );

                        try {
                            socket.destroy();
                        } catch (_) {}
                    }
                }
            );

        } catch (error) {

            console.error("");
            console.error("❌ SERVIDOR INDISPONÍVEL");
            console.error(error.message);

            try {
                socket.destroy();
            } catch (_) {}
        }

        socket.once("close", () => {
            connections--;

            if (connections < 0) {
                connections = 0;
            }
        });
    }
);


// =====================================================
// ERRO DO PROXY
// =====================================================

proxy.on("error", (error) => {
    console.error(
        "❌ Erro do Proxy: " +
        error.message
    );
});


// =====================================================
// ERRO DO SERVIDOR HTTP
// =====================================================

server.on(
    "clientError",
    (error, socket) => {

        if (!socket.destroyed) {
            socket.destroy();
        }
    }
);


// =====================================================
// STATUS
// =====================================================

setInterval(() => {
    console.log(
        "📊 Conexões ativas: " +
        connections
    );
}, 30000);


// =====================================================
// INICIAR
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log("========================================");
        console.log("🚀 EAGLERCRAFT WSS PROXY");
        console.log("========================================");

        console.log(
            "Porta: " +
            PORT
        );

        console.log("");
        console.log("📡 ATERNOS:");
        console.log(
            ATERNOS_HOST +
            ":" +
            ATERNOS_PORT
        );

        console.log("");
        console.log("📡 FALIX:");
        console.log(
            FALIX_HOST +
            ":" +
            FALIX_PORT
        );

        console.log("");
        console.log("🟢 PROXY ONLINE");
        console.log("========================================");
    }
);
```
