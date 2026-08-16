const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

const ATERNOS_DOMAIN = "mundoeterno_etec.aternos.me";
const SRV_RECORD = `_minecraft._tcp.${ATERNOS_DOMAIN}`;

const PORT = process.env.PORT || 10000;

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
    proxyTimeout: 10000,
    perMessageDeflate: false
});

async function getTargets() {

    console.log("");
    console.log("🔎 Consultando SRV:");
    console.log(SRV_RECORD);

    const srv = await dns.resolveSrv(SRV_RECORD);

    if (!srv.length) {
        throw new Error("Nenhum registro SRV encontrado.");
    }

    srv.sort((a, b) => {

        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }

        return b.weight - a.weight;
    });

    const targets = [];

    for (const record of srv) {

        const hostname =
            record.name.replace(/\.$/, "");

        const port = record.port;

        console.log("");
        console.log("📡 SRV encontrado:");
        console.log("   Host: " + hostname);
        console.log("   Porta: " + port);

        try {

            const ips =
                await dns.resolve4(hostname);

            for (const ip of ips) {

                console.log("   IP: " + ip);

                targets.push({
                    hostname,
                    ip,
                    port
                });
            }

        } catch (error) {

            console.error(
                "❌ Não conseguiu resolver " +
                hostname +
                ": " +
                error.message
            );
        }
    }

    if (!targets.length) {
        throw new Error(
            "Nenhum destino IPv4 encontrado."
        );
    }

    return targets;
}

function testTCP(ip, port, timeout = 8000) {

    return new Promise((resolve) => {

        const socket = new net.Socket();

        let finished = false;

        const start = Date.now();

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

        socket.setTimeout(timeout);

        socket.connect(
            port,
            ip,
            () => {

                const time =
                    Date.now() - start;

                console.log(
                    "🟢 TCP OK " +
                    ip +
                    ":" +
                    port +
                    " (" +
                    time +
                    "ms)"
                );

                finish(true);
            }
        );

        socket.on(
            "timeout",
            () => {

                console.log(
                    "🔴 TCP TIMEOUT " +
                    ip +
                    ":" +
                    port
                );

                finish(false);
            }
        );

        socket.on(
            "error",
            (error) => {

                console.log(
                    "🔴 TCP ERRO " +
                    ip +
                    ":" +
                    port +
                    " → " +
                    (error.code ||
                        error.message)
                );

                finish(false);
            }
        );
    });
}

async function findWorkingTarget() {

    const targets =
        await getTargets();

    console.log("");
    console.log(
        "========================================"
    );
    console.log(
        "🧪 TESTANDO CONECTIVIDADE"
    );
    console.log(
        "========================================"
    );

    for (const target of targets) {

        const ok =
            await testTCP(
                target.ip,
                target.port
            );

        if (ok) {

            console.log("");
            console.log(
                "========================================"
            );
            console.log(
                "🟢 DESTINO FUNCIONANDO"
            );
            console.log(
                "========================================"
            );

            console.log(
                target.hostname +
                ":" +
                target.port
            );

            console.log(
                "IP: " +
                target.ip
            );

            console.log(
                "========================================"
            );

            return target;
        }
    }

    throw new Error(
        "Nenhum destino Aternos aceitou conexão TCP."
    );
}

let connections = 0;

server.on(
    "upgrade",
    async (req, socket, head) => {

        connections++;

        console.log("");
        console.log(
            "========================================"
        );
        console.log(
            "📡 NOVA CONEXÃO EAGLERCRAFT"
        );
        console.log(
            "========================================"
        );

        try {

            const target =
                await findWorkingTarget();

            console.log("");
            console.log(
                "🔗 Encaminhando para:"
            );

            console.log(
                "ws://" +
                target.hostname +
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
                        target.hostname +
                        ":" +
                        target.port,

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

                        try {
                            socket.destroy();
                        } catch {}
                    }
                }
            );

        } catch (error) {

            console.error("");
            console.error(
                "❌ ATERNOS INACESSÍVEL"
            );

            console.error(
                error.message
            );

            try {
                socket.destroy();
            } catch {}
        }

        socket.once(
            "close",
            () => {

                connections--;

                if (connections < 0) {
                    connections = 0;
                }
            }
        );
    }
);

proxy.on(
    "error",
    (error) => {

        console.error(
            "❌ Proxy:",
            error.message
        );
    }
);

server.on(
    "clientError",
    (error, socket) => {

        if (!socket.destroyed) {
            socket.destroy();
        }
    }
);

setInterval(
    () => {

        console.log(
            "📊 Conexões ativas: " +
            connections
        );

    },
    30000
);

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "========================================"
        );
        console.log(
            "🚀 EAGLERCRAFT WSS PROXY"
        );
        console.log(
            "========================================"
        );

        console.log(
            "Porta: " +
            PORT
        );

        console.log(
            "Aternos: " +
            ATERNOS_DOMAIN
        );

        console.log(
            "SRV: " +
            SRV_RECORD
        );

        console.log(
            "========================================"
        );
    }
);
