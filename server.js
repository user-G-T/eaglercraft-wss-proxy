```js
const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

const app = express();
const server = http.createServer(app);

// =====================================================
// CONFIGURAÇÃO
// =====================================================

// ATERNOS
const ATERNOS_HOST =
    process.env.ATERNOS_HOST ||
    "mundoeterno_etec.aternos.me";

const ATERNOS_PORT =
    Number(process.env.ATERNOS_PORT) || 49413;


// FALIX
const FALIX_HOST =
    process.env.FALIX_HOST ||
    "mundoeternoetec.falix.me";

const FALIX_PORT =
    Number(process.env.FALIX_PORT) || 22899;


// RENDER
const PORT =
    Number(process.env.PORT) || 10000;


// =====================================================
// HTTP
// =====================================================

app.get("/", (req, res) => {
    res.status(200).send(
        "Eaglercraft WSS Proxy - Aternos + Falix"
    );
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});


// =====================================================
// WEBSOCKET PROXY
// =====================================================

const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    proxyTimeout: 10000,
    timeout: 15000,
    perMessageDeflate: false
});


// =====================================================
// DNS
// =====================================================

async function resolveHost(host) {

    const addresses =
        await dns.resolve4(host);

    if (!addresses.length) {
        throw new Error(
            `Nenhum IP encontrado para ${host}`
        );
    }

    return addresses;
}


// =====================================================
// CRIAR DESTINOS
// =====================================================

async function getTargets() {

    const targets = [];


    // -------------------------------------------------
    // FALIX
    // -------------------------------------------------

    try {

        console.log("");
        console.log("🔎 Procurando Falix...");
        console.log(
            `${FALIX_HOST}:${FALIX_PORT}`
        );

        const ips =
            await resolveHost(FALIX_HOST);

        for (const ip of ips) {

            targets.push({
                provider: "Falix",
                host: FALIX_HOST,
                ip: ip,
                port: FALIX_PORT
            });

            console.log(
                `📡 Falix IP: ${ip}`
            );
        }

    } catch (error) {

        console.log(
            `⚠️ Falix não encontrado: ${error.message}`
        );

    }


    // -------------------------------------------------
    // ATERNOS
    // -------------------------------------------------

    try {

        console.log("");
        console.log("🔎 Procurando Aternos...");
        console.log(
            `${ATERNOS_HOST}:${ATERNOS_PORT}`
        );

        const ips =
            await resolveHost(ATERNOS_HOST);

        for (const ip of ips) {

            targets.push({
                provider: "Aternos",
                host: ATERNOS_HOST,
                ip: ip,
                port: ATERNOS_PORT
            });

            console.log(
                `📡 Aternos IP: ${ip}`
            );
        }

    } catch (error) {

        console.log(
            `⚠️ Aternos não encontrado: ${error.message}`
        );

    }


    return targets;
}


// =====================================================
// TESTAR TCP
// =====================================================

function testTCP(ip, port) {

    return new Promise((resolve) => {

        const socket =
            new net.Socket();

        let done = false;


        function finish(result) {

            if (done) return;

            done = true;

            try {
                socket.destroy();
            } catch {}

            resolve(result);
        }


        socket.setTimeout(8000);


        socket.connect(
            port,
            ip,
            () => {

                console.log(
                    `🟢 TCP OK: ${ip}:${port}`
                );

                finish(true);
            }
        );


        socket.on(
            "timeout",
            () => {

                console.log(
                    `🔴 Timeout: ${ip}:${port}`
                );

                finish(false);
            }
        );


        socket.on(
            "error",
            (error) => {

                console.log(
                    `🔴 Erro TCP ${ip}:${port}: ${error.code || error.message}`
                );

                finish(false);
            }
        );

    });
}


// =====================================================
// ESCOLHER SERVIDOR
// =====================================================

async function findServer() {

    const targets =
        await getTargets();


    if (!targets.length) {

        throw new Error(
            "Nenhum servidor foi encontrado."
        );
    }


    console.log("");
    console.log(
        "========== TESTANDO SERVIDORES =========="
    );


    // IMPORTANTE:
    // Falix vem primeiro.
    // Se estiver offline, tenta Aternos.

    for (const target of targets) {

        console.log("");
        console.log(
            `🔎 Testando ${target.provider}`
        );

        console.log(
            `${target.host}:${target.port}`
        );


        const online =
            await testTCP(
                target.ip,
                target.port
            );


        if (online) {

            console.log("");
            console.log(
                `🟢 ${target.provider} ONLINE`
            );

            console.log(
                `${target.ip}:${target.port}`
            );

            return target;
        }
    }


    throw new Error(
        "Nenhum dos servidores está online."
    );
}


// =====================================================
// CONEXÕES
// =====================================================

let connections = 0;


// =====================================================
// WEBSOCKET
// =====================================================

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
                await findServer();


            console.log("");
            console.log(
                `🔗 Destino: ${target.provider}`
            );

            console.log(
                `${target.ip}:${target.port}`
            );


            proxy.ws(
                req,
                socket,
                head,
                {
                    target:
                        `ws://${target.ip}:${target.port}`,

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
                "❌ SERVIDOR INDISPONÍVEL"
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
            }
        );
    }
);


// =====================================================
// ERROS
// =====================================================

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


// =====================================================
// STATUS
// =====================================================

setInterval(
    () => {

        console.log(
            `📊 Conexões ativas: ${connections}`
        );

    },
    30000
);


// =====================================================
// INICIAR
// =====================================================

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
            `Porta: ${PORT}`
        );

        console.log("");

        console.log(
            "📡 ATERNOS:"
        );

        console.log(
            `${ATERNOS_HOST}:${ATERNOS_PORT}`
        );

        console.log("");

        console.log(
            "📡 FALIX:"
        );

        console.log(
            `${FALIX_HOST}:${FALIX_PORT}`
        );

        console.log("");

        console.log(
            "🟢 PROXY ONLINE"
        );

        console.log(
            "========================================"
        );
    }
);
```
