```js
const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

// ---------------- ATERNOS ----------------

const ATERNOS_DOMAIN =
    process.env.ATERNOS_DOMAIN ||
    "mundoeterno_etec.aternos.me";

const ATERNOS_SRV =
    `_minecraft._tcp.${ATERNOS_DOMAIN}`;


// ---------------- FALIX ----------------

const FALIX_DOMAIN =
    process.env.FALIX_DOMAIN ||
    "mundoeternoetec.falix.me";

const FALIX_PORT =
    Number(process.env.FALIX_PORT) || 22899;


// ---------------- RENDER ----------------

const PORT =
    Number(process.env.PORT) || 10000;


// =====================================================
// EXPRESS
// =====================================================

const app = express();

const server = http.createServer(app);


// =====================================================
// ROTAS HTTP
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
// RESOLVER IPV4
// =====================================================

async function resolveIPv4(hostname) {

    const addresses =
        await dns.resolve4(hostname);

    if (!addresses || addresses.length === 0) {

        throw new Error(
            `Nenhum endereço IPv4 encontrado para ${hostname}`
        );

    }

    return addresses;

}


// =====================================================
// ATERNOS - SRV
// =====================================================

async function getAternosTargets() {

    console.log("");
    console.log("========================================");
    console.log("🔎 ATERNOS");
    console.log("========================================");

    console.log(
        `SRV: ${ATERNOS_SRV}`
    );


    let records;

    try {

        records =
            await dns.resolveSrv(ATERNOS_SRV);

    } catch (error) {

        throw new Error(
            `Falha ao consultar SRV do Aternos: ${error.message}`
        );

    }


    if (!records || records.length === 0) {

        throw new Error(
            "Nenhum registro SRV encontrado no Aternos."
        );

    }


    records.sort((a, b) => {

        if (a.priority !== b.priority) {

            return a.priority - b.priority;

        }

        return b.weight - a.weight;

    });


    const targets = [];


    for (const record of records) {

        const hostname =
            record.name.replace(/\.$/, "");

        const port =
            Number(record.port);


        console.log("");
        console.log("📡 Registro SRV:");

        console.log(
            `   Host: ${hostname}`
        );

        console.log(
            `   Porta: ${port}`
        );


        try {

            const ips =
                await resolveIPv4(hostname);


            for (const ip of ips) {

                console.log(
                    `   IP: ${ip}`
                );


                targets.push({

                    provider: "Aternos",

                    hostname: hostname,

                    ip: ip,

                    port: port

                });

            }

        } catch (error) {

            console.error(
                `❌ Falha ao resolver ${hostname}: ${error.message}`
            );

        }

    }


    return targets;

}


// =====================================================
// FALIX
// =====================================================

async function getFalixTargets() {

    console.log("");
    console.log("========================================");
    console.log("🔎 FALIX");
    console.log("========================================");

    console.log(
        `Host: ${FALIX_DOMAIN}`
    );

    console.log(
        `Porta: ${FALIX_PORT}`
    );


    let ips;

    try {

        ips =
            await resolveIPv4(FALIX_DOMAIN);

    } catch (error) {

        throw new Error(
            `Falha ao resolver Falix: ${error.message}`
        );

    }


    const targets = [];


    for (const ip of ips) {

        console.log(
            `   IP: ${ip}`
        );


        targets.push({

            provider: "Falix",

            hostname: FALIX_DOMAIN,

            ip: ip,

            port: FALIX_PORT

        });

    }


    return targets;

}


// =====================================================
// TESTE TCP
// =====================================================

function testTCP(
    ip,
    port,
    timeout = 8000
) {

    return new Promise((resolve) => {

        const socket =
            new net.Socket();

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


        socket.setTimeout(timeout);


        socket.connect(
            port,
            ip,
            () => {

                console.log(
                    `🟢 TCP OK ${ip}:${port}`
                );

                finish(true);

            }
        );


        socket.once(
            "timeout",
            () => {

                console.log(
                    `🔴 TCP TIMEOUT ${ip}:${port}`
                );

                finish(false);

            }
        );


        socket.once(
            "error",
            (error) => {

                console.log(
                    `🔴 TCP ERRO ${ip}:${port} → ${error.code || error.message}`
                );

                finish(false);

            }
        );

    });

}


// =====================================================
// ENCONTRAR SERVIDOR ONLINE
// =====================================================

async function findWorkingTarget() {

    let targets = [];


    // =================================================
    // TENTAR FALIX
    // =================================================

    try {

        const falixTargets =
            await getFalixTargets();

        targets.push(
            ...falixTargets
        );

    } catch (error) {

        console.error("");
        console.error(
            "⚠️ Falix indisponível:"
        );

        console.error(
            error.message
        );

    }


    // =================================================
    // TENTAR ATERNOS
    // =================================================

    try {

        const aternosTargets =
            await getAternosTargets();

        targets.push(
            ...aternosTargets
        );

    } catch (error) {

        console.error("");
        console.error(
            "⚠️ Aternos indisponível:"
        );

        console.error(
            error.message
        );

    }


    if (targets.length === 0) {

        throw new Error(
            "Nenhum servidor foi encontrado."
        );

    }


    console.log("");
    console.log("========================================");
    console.log("🧪 TESTANDO SERVIDORES");
    console.log("========================================");


    // =================================================
    // TESTAR DESTINOS
    // =================================================

    for (const target of targets) {

        console.log("");
        console.log(
            `🔎 Testando ${target.provider}`
        );

        console.log(
            `   ${target.ip}:${target.port}`
        );


        const online =
            await testTCP(
                target.ip,
                target.port
            );


        if (online) {

            console.log("");
            console.log("========================================");

            console.log(
                `🟢 ${target.provider.toUpperCase()} ONLINE`
            );

            console.log("========================================");

            console.log(
                `Host: ${target.hostname}`
            );

            console.log(
                `IP: ${target.ip}`
            );

            console.log(
                `Porta: ${target.port}`
            );

            console.log("========================================");


            return target;

        }

    }


    throw new Error(
        "Nenhum servidor está aceitando conexões TCP."
    );

}


// =====================================================
// CONEXÕES EAGLERCRAFT
// =====================================================

let connections = 0;


// =====================================================
// WEBSOCKET UPGRADE
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

            const target =
                await findWorkingTarget();


            console.log("");
            console.log(
                `🔗 Encaminhando para ${target.provider}`
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
                "❌ NENHUM SERVIDOR DISPONÍVEL"
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
// ERRO DO PROXY
// =====================================================

proxy.on(
    "error",
    (error) => {

        console.error(
            "❌ Erro do proxy:",
            error.message
        );

    }
);


// =====================================================
// ERRO DO SERVIDOR
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
        console.log("========================================");
        console.log("🚀 EAGLERCRAFT WSS PROXY");
        console.log("========================================");

        console.log(
            `Porta: ${PORT}`
        );

        console.log("");
        console.log("📡 ATERNOS");

        console.log(
            `Domínio: ${ATERNOS_DOMAIN}`
        );

        console.log(
            `SRV: ${ATERNOS_SRV}`
        );

        console.log("");
        console.log("📡 FALIX");

        console.log(
            `Domínio: ${FALIX_DOMAIN}`
        );

        console.log(
            `Porta: ${FALIX_PORT}`
        );

        console.log("");
        console.log("========================================");
        console.log("🟢 PROXY ONLINE");
        console.log("========================================");

    }
);
```
