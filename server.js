const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const ATERNOS_DOMAIN = "mundoeterno_etec.aternos.me";
const SRV_RECORD = `_minecraft._tcp.${ATERNOS_DOMAIN}`;

const PROXY_PORT = process.env.PORT || 10000;

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
    changeOrigin: true,
    proxyTimeout: 15000,
    timeout: 0
});

// =====================================================
// DNS SRV
// =====================================================

async function getAternosTarget() {

    console.log("");
    console.log("🔎 ========================================");
    console.log("🔎 TESTE 1: DNS SRV");
    console.log("🔎 ========================================");

    console.log(`🔎 Consultando: ${SRV_RECORD}`);

    const records = await dns.resolveSrv(SRV_RECORD);

    if (!records || records.length === 0) {
        throw new Error("Nenhum registro SRV encontrado.");
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

    console.log("✅ DNS SRV FUNCIONOU");
    console.log(`   Host: ${hostname}`);
    console.log(`   Porta: ${port}`);

    return {
        hostname,
        port
    };
}

// =====================================================
// DNS A
// =====================================================

async function resolveHostname(hostname) {

    console.log("");
    console.log("🔎 ========================================");
    console.log("🔎 TESTE 2: DNS A");
    console.log("🔎 ========================================");

    console.log(`🔎 Resolvendo: ${hostname}`);

    const addresses = await dns.resolve4(hostname);

    if (!addresses || addresses.length === 0) {
        throw new Error("Nenhum endereço IPv4 encontrado.");
    }

    console.log("✅ DNS A FUNCIONOU");

    for (const ip of addresses) {
        console.log(`   IP: ${ip}`);
    }

    return addresses[0];
}

// =====================================================
// TESTE TCP
// =====================================================

function testTCP(host, port) {

    return new Promise((resolve) => {

        console.log("");
        console.log("🔎 ========================================");
        console.log("🔎 TESTE 3: TCP");
        console.log("🔎 ========================================");

        console.log(`🔌 Testando: ${host}:${port}`);
        console.log("⏳ Timeout: 15 segundos");

        const socket = new net.Socket();

        const start = Date.now();

        let finished = false;

        function finish(result) {

            if (finished) {
                return;
            }

            finished = true;

            try {
                socket.destroy();
            } catch {}

            resolve(result);
        }

        socket.setTimeout(15000);

        socket.connect(port, host, () => {

            const elapsed = Date.now() - start;

            console.log("");
            console.log("🟢 ========================================");
            console.log("🟢 TCP FUNCIONOU!");
            console.log("🟢 ========================================");

            console.log(`🟢 Conectou em ${elapsed}ms`);

            finish(true);
        });

        socket.on("timeout", () => {

            const elapsed = Date.now() - start;

            console.log("");
            console.log("🔴 ========================================");
            console.log("🔴 TCP TIMEOUT!");
            console.log("🔴 ========================================");

            console.log(`🔴 Nenhuma resposta após ${elapsed}ms`);
            console.log(`🔴 Destino: ${host}:${port}`);

            finish(false);
        });

        socket.on("error", (error) => {

            const elapsed = Date.now() - start;

            console.log("");
            console.log("🔴 ========================================");
            console.log("🔴 TCP ERRO!");
            console.log("🔴 ========================================");

            console.log(`🔴 Erro: ${error.message}`);
            console.log(`🔴 Tempo: ${elapsed}ms`);
            console.log(`🔴 Destino: ${host}:${port}`);

            finish(false);
        });

    });
}

// =====================================================
// TESTE COMPLETO
// =====================================================

async function runDiagnostic() {

    console.log("");
    console.log("========================================");
    console.log("🧪 DIAGNÓSTICO ATERNOS");
    console.log("========================================");

    try {

        // TESTE 1
        const destination = await getAternosTarget();

        // TESTE 2
        const ip = await resolveHostname(
            destination.hostname
        );

        // TESTE 3
        const tcpOK = await testTCP(
            ip,
            destination.port
        );

        console.log("");
        console.log("========================================");
        console.log("📋 RESULTADO");
        console.log("========================================");

        console.log(
            `DNS SRV:       ✅`
        );

        console.log(
            `DNS A:         ✅`
        );

        console.log(
            `TCP Aternos:   ${tcpOK ? "✅ FUNCIONOU" : "❌ FALHOU"}`
        );

        console.log(
            `Destino:       ${ip}:${destination.port}`
        );

        console.log("========================================");

        return {
            hostname: destination.hostname,
            port: destination.port,
            ip,
            tcpOK
        };

    } catch (error) {

        console.log("");
        console.log("========================================");
        console.log("❌ DIAGNÓSTICO FALHOU");
        console.log("========================================");

        console.error(error);

        console.log("========================================");

        return null;
    }
}

// =====================================================
// WEBSOCKET
// =====================================================

let activeConnections = 0;

server.on("upgrade", async (req, socket, head) => {

    activeConnections++;

    console.log("");
    console.log("========================================");
    console.log("📡 WEBSOCKET RECEBIDO");
    console.log("========================================");

    try {

        const destination = await getAternosTarget();

        const ip = await resolveHostname(
            destination.hostname
        );

        console.log("");
        console.log("🔗 Tentando WebSocket:");
        console.log(
            `   ws://${destination.hostname}:${destination.port}`
        );

        proxy.ws(
            req,
            socket,
            head,
            {
                target:
                    `ws://${destination.hostname}:${destination.port}`,

                ws: true,
                changeOrigin: true,
                perMessageDeflate: false
            },
            (error) => {

                if (error) {

                    console.error(
                        "❌ WebSocket → Aternos:",
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
            "❌ Erro preparando conexão:",
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

// =====================================================
// ERROS
// =====================================================

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

// =====================================================
// STATUS
// =====================================================

setInterval(() => {

    console.log(
        `📊 Conexões ativas: ${activeConnections}`
    );

}, 60000);

// =====================================================
// INICIAR
// =====================================================

server.listen(
    PROXY_PORT,
    "0.0.0.0",
    async () => {

        console.log("");
        console.log("========================================");
        console.log("🚀 EAGLERCRAFT WSS PROXY");
        console.log("========================================");
        console.log(`Porta: ${PROXY_PORT}`);
        console.log(`Aternos: ${ATERNOS_DOMAIN}`);
        console.log(`SRV: ${SRV_RECORD}`);
        console.log("========================================");

        // Executa o diagnóstico automaticamente
        // assim que o Render iniciar.
        await runDiagnostic();
    }
);
