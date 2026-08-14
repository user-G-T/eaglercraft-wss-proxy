const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const dns = require("dns").promises;

const app = express();

const PORT = process.env.PORT || 10000;

// DOMÍNIO FIXO DO SEU SERVIDOR
const ATERNOS_DOMAIN = "mundoeterno_etec.aternos.me";

// Porta padrão do seu servidor Aternos
const DEFAULT_PORT = 49413;

const server = http.createServer(app);

const wss = new WebSocket.Server({
    noServer: true,
    perMessageDeflate: false
});

app.get("/", (req, res) => {
    res.status(200).send("Eaglercraft WSS Proxy ONLINE");
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

async function resolveAternos() {

    console.log("");
    console.log("========================================");
    console.log("🔎 Procurando servidor Aternos");
    console.log("Domínio:", ATERNOS_DOMAIN);
    console.log("========================================");

    try {

        const srvName = `_minecraft._tcp.${ATERNOS_DOMAIN}`;

        const records = await dns.resolveSrv(srvName);

        if (records.length > 0) {

            const record = records[0];

            const host = record.name.replace(/\.$/, "");
            const port = record.port;

            console.log("✅ SRV encontrado!");
            console.log("Host:", host);
            console.log("Porta:", port);

            return {
                host,
                port
            };
        }

    } catch (err) {

        console.log("⚠️ SRV não encontrado:");
        console.log(err.message);
    }

    // Fallback
    console.log("⚠️ Usando domínio diretamente");

    const addresses = await dns.resolve4(ATERNOS_DOMAIN);

    console.log("IP:", addresses[0]);

    return {
        host: ATERNOS_DOMAIN,
        port: DEFAULT_PORT
    };
}

server.on("upgrade", async (req, socket, head) => {

    console.log("");
    console.log("========================================");
    console.log("📡 NOVA CONEXÃO WSS");
    console.log("========================================");

    try {

        const target = await resolveAternos();

        console.log("");
        console.log("🔗 Destino final:");
        console.log(`${target.host}:${target.port}`);

        const targetUrl = `ws://${target.host}:${target.port}`;

        console.log("🔌 Abrindo conexão com Aternos...");
        console.log(targetUrl);

        const backend = new WebSocket(targetUrl, {
            perMessageDeflate: false,
            handshakeTimeout: 10000
        });

        let clientWS;

        backend.on("open", () => {

            console.log("🟢 CONECTADO AO ATERNOS!");

            wss.handleUpgrade(req, socket, head, (ws) => {

                clientWS = ws;

                console.log("🟢 CLIENTE EAGLER CONECTADO!");

                // Aternos → Eagler
                backend.on("message", (data, isBinary) => {

                    if (clientWS.readyState === WebSocket.OPEN) {

                        clientWS.send(data, {
                            binary: isBinary
                        });

                    }
                });

                // Eagler → Aternos
                clientWS.on("message", (data, isBinary) => {

                    if (backend.readyState === WebSocket.OPEN) {

                        backend.send(data, {
                            binary: isBinary
                        });

                    }
                });

                clientWS.on("close", () => {

                    console.log("🔴 Cliente Eagler desconectou");

                    if (backend.readyState === WebSocket.OPEN) {
                        backend.close();
                    }

                });

                clientWS.on("error", (err) => {

                    console.log("❌ Erro no cliente:", err.message);

                    if (backend.readyState === WebSocket.OPEN) {
                        backend.close();
                    }

                });

            });

        });

        backend.on("error", (err) => {

            console.log("");
            console.log("❌ ERRO AO CONECTAR AO ATERNOS");
            console.log(err.message);

            if (!clientWS) {
                socket.destroy();
            }

        });

        backend.on("close", (code, reason) => {

            console.log(
                "🔴 Conexão Aternos fechada:",
                code,
                reason.toString()
            );

            if (
                clientWS &&
                clientWS.readyState === WebSocket.OPEN
            ) {
                clientWS.close();
            }

        });

    } catch (err) {

        console.log("");
        console.log("❌ ERRO NO PROXY");
        console.log(err);

        socket.destroy();
    }

});

server.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log("🚀 EAGLERCRAFT WSS PROXY");
    console.log("========================================");

    console.log("Porta:", PORT);

    console.log("Aternos:", ATERNOS_DOMAIN);

    console.log(
        "SRV:",
        `_minecraft._tcp.${ATERNOS_DOMAIN}`
    );

    console.log("========================================");
});
