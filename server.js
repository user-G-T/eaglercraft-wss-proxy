```js
const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

// ATERNOS
const ATERNOS_DOMAIN =
    process.env.ATERNOS_DOMAIN ||
    "mundoeterno_etec.aternos.me";

const ATERNOS_SRV =
    `_minecraft._tcp.${ATERNOS_DOMAIN}`;

// FALIX
const FALIX_DOMAIN =
    process.env.FALIX_DOMAIN ||
    "mundoeternoetec.falix.me";

const FALIX_PORT =
    Number(process.env.FALIX_PORT) || 22899;

// PORTA DO RENDER
const PORT =
    Number(process.env.PORT) || 10000;

// ---------- FALIX ----------

// Domínio do seu servidor Falix
const FALIX_DOMAIN =
    process.env.FALIX_DOMAIN ||
    "mundoeternoetec.falix.me";

// Porta atual do Falix
const FALIX_PORT =
    Number(process.env.FALIX_PORT) || 22899;


// ---------- PROXY ----------

const PORT =
    Number(process.env.PORT) || 10000;


// =====================================================
// EXPRESS
// =====================================================

const app = express();

const server = http.createServer(app);


// Página principal

app.get("/", (req, res) => {

    res.status(200).send(
        "Eaglercraft WSS Proxy - Aternos + Falix"
    );

});


// Health check

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

    perMessageDeflate: false

});


// =====================================================
// RESOLVER IP DO DOMÍNIO
// =====================================================

async function resolveIPv4(hostname) {

    try {

        const ips =
            await dns.resolve4(hostname);

        if (!ips.length) {

            throw new Error(
                `Nenhum IPv4 encontrado para ${hostname}`
            );

        }

        return ips;

    } catch (error) {

        throw new Error(
            `Não conseguiu resolver ${hostname}: ${error.message}`
        );

    }

}


// =====================================================
// DESCOBRIR DESTINOS ATERNOS VIA SRV
// =====================================================

async function getAternosTargets() {

    console.log("");
    console.log("========================================");
    console.log("🔎 PROCURANDO ATERNOS VIA SRV");
    console.log("========================================");

    console.log(
        `SRV: ${ATERNOS_SRV}`
    );


    const srv =
        await dns.resolveSrv(ATERNOS_SRV);


    if (!srv.length) {

        throw new Error(
            "Nenhum registro SRV do Aternos encontrado."
        );

    }


    // Ordenar por prioridade e peso

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

        const port =
            record.port;


        console.log("");
        console.log("📡 SRV Aternos encontrado:");

        console.log(
            `   Host: ${hostname}`
        );

        console.log(
            `   Porta: ${port}`
        );


        try {

            const ips =
                await dns.resolve4(hostname);


            for (const ip of ips) {

                console.log(
                    `   IP: ${ip}`
                );


                targets.push({

                    provider: "Aternos",

                    hostname,

                    ip,

                    port

                });

            }

        } catch (error) {

            console.error(
                `❌ Erro DNS ${hostname}:`,
                error.message
            );

        }

    }


    return targets;

}


// =====================================================
// DESCOBRIR DESTINOS FALIX
// =====================================================

async function getFalixTargets() {

    console.log("");
    console.log("========================================");
    console.log("🔎 PROCURANDO FALIX");
    console.log("========================================");

    console.log(
        `Host: ${FALIX_DOMAIN}`
    );

    console.log(
        `Porta: ${FALIX_PORT}`
    );


    const ips =
        await resolveIPv4(FALIX_DOMAIN);


    const targets = [];


    for (const ip of ips) {

        console.log(
            `   IP: ${ip}`
        );


        targets.push({

            provider: "Falix",

            hostname: FALIX_DOMAIN,

            ip,

            port: FALIX_PORT

        });

    }


    return targets;

}


// =====================================================
// TESTAR TCP
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

        const start =
            Date.now();


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
                    `🟢 TCP OK ${ip}:${port} (${time}ms)`
                );


                finish(true);

            }
        );


        socket.on(
            "timeout",
            () => {

                console.log(
                    `🔴 TCP TIMEOUT ${ip}:${port}`
                );


                finish(false);

            }
        );


        socket.on(
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
// TESTAR TODOS OS DESTINOS
// =====================================================

async function findWorkingTarget() {

    let targets = [];


    // =================================================
    // FALIX
    // =================================================

    try {

        const falix =
            await getFalixTargets();


        targets.push(
            ...falix
        );

    } catch (error) {

        console.error("");
        console.error(
            "⚠️ Falix não pôde ser localizado:"
        );

        console.error(
            error.message
        );

    }


    // =================================================
    // ATERNOS
    // =================================================

    try {

        const aternos =
            await getAternosTargets();


        targets.push(
            ...aternos
        );

    } catch (error) {

        console.error("");
        console.error(
            "⚠️ Aternos não pôde ser localizado:"
        );

        console.error(
            error.message
        );

    }


    // =================================================
    // NENHUM DESTINO ENCONTRADO
    // =================================================

    if (!targets.length) {

        throw new Error(
            "Nenhum destino foi encontrado."
        );

    }


    console.log("");
    console.log("========================================");
    console.log("🧪 TESTANDO SERVIDORES");
    console.log("========================================");


    // =================================================
    // TESTAR UM POR UM
    // =================================================

    for (const target of targets) {

        console.log("");

        console.log(
            `🔎 Testando ${target.provider}`
        );

        console.log(
            `   ${target.hostname}:${target.port}`
        );


        const ok =
            await testTCP(
                target.ip,
                target.port
            );


        if (ok) {

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
        "Aternos e Falix foram encontrados, mas nenhum está aceitando conexões."
    );

}


// =====================================================
// WEBSOCKET
// =====================================================

let connections = 0;


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
                `🔗 Servidor escolhido: ${target.provider}`
            );


            console.log(
                `   ${target.hostname}:${target.port}`
            );


            console.log(
                `   IP: ${target.ip}`
            );


            // =========================================
            // ENCAMINHAR WEBSOCKET
            // =========================================

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
// ERROS DO PROXY
// =====================================================

proxy.on(
    "error",
    (error) => {

        console.error(
            "❌ Erro do Proxy:",
            error.message
        );

    }
);


// =====================================================
// ERROS HTTP
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
            `Porta do Proxy: ${PORT}`
        );


        console.log("");
        console.log("📡 ATERNOS:");

        console.log(
            `   Domínio: ${ATERNOS_DOMAIN}`
        );

        console.log(
            `   SRV: ${ATERNOS_SRV}`
        );


        console.log("");
        console.log("📡 FALIX:");

        console.log(
            `   Domínio: ${FALIX_DOMAIN}`
        );

        console.log(
            `   Porta: ${FALIX_PORT}`
        );


        console.log("");
        console.log("========================================");

        console.log(
            "🟢 Proxy iniciado."
        );

        console.log(
            "🟢 Aguardando conexões EagleCraft..."
        );

        console.log("========================================");

    }
);
```
