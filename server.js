
const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const dns = require("dns").promises;
const net = require("net");

const ATERNOS_HOST = process.env.ATERNOS_HOST || "mundoeterno_etec.aternos.me";
const ATERNOS_PORT = Number(process.env.ATERNOS_PORT) || 49413;

const FALIX_HOST = process.env.FALIX_HOST || "mundoeternoetec.falix.me";
const FALIX_PORT = Number(process.env.FALIX_PORT) || 22899;

const PORT = Number(process.env.PORT) || 10000;

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
    res.status(200).send("Eaglercraft WSS Proxy - Aternos + Falix");
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    proxyTimeout: 10000,
    timeout: 15000,
    perMessageDeflate: false
});

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

async function getTargets() {
    const targets = [];

    try {
        const ips = await resolveHost(FALIX_HOST);

        for (const ip of ips) {
            targets.push({
                provider: "Falix",
                host: FALIX_HOST,
                ip: ip,
                port: FALIX_PORT
            });
        }
    } catch (error) {
        console.log("Falix indisponível: " + error.message);
    }

    try {
        const ips = await resolveHost(ATERNOS_HOST);

        for (const ip of ips) {
            targets.push({
                provider: "Aternos",
                host: ATERNOS_HOST,
                ip: ip,
                port: ATERNOS_PORT
            });
        }
    } catch (error) {
        console.log("Aternos indisponível: " + error.message);
    }

    return targets;
}

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
            console.log("TCP OK: " + ip + ":" + port);
            finish(true);
        });

        socket.on("timeout", () => {
            console.log("TCP TIMEOUT: " + ip + ":" + port);
            finish(false);
        });

        socket.on("error", (error) => {
            console.log(
                "TCP ERRO: " +
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

async function findWorkingServer() {
    const targets = await getTargets();

    if (targets.length === 0) {
        throw new Error("Nenhum servidor foi encontrado.");
    }

    for (const target of targets) {
        console.log(
            "Testando " +
            target.provider +
            " em " +
            target.ip +
            ":" +
            target.port
        );

        const online = await testTCP(
            target.ip,
            target.port
        );

        if (online) {
            console.log(
                target.provider +
                " ONLINE"
            );

            return target;
        }
    }

    throw new Error(
        "Nenhum dos servidores está online."
    );
}

let connections = 0;

server.on(
    "upgrade",
    async (req, socket, head) => {
        connections++;

        console.log(
            "Nova conexão EagleCraft"
        );

        try {
            const target = await findWorkingServer();

            console.log(
                "Conectando ao " +
                target.provider +
                " em " +
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
                            "Erro WebSocket: " +
                            error.message
                        );

                        try {
                            socket.destroy();
                        } catch (_) {}
                    }
                }
            );
        } catch (error) {
            console.error(
                "Servidor indisponível: " +
                error.message
            );

            try {
                socket.destroy();
            } catch (_) {}
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
            "Erro do Proxy: " +
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
            "Conexões ativas: " +
            connections
        );
    },
    30000
);

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "EAGLERCRAFT WSS PROXY ONLINE"
        );

        console.log(
            "Aternos: " +
            ATERNOS_HOST +
            ":" +
            ATERNOS_PORT
        );

        console.log(
            "Falix: " +
            FALIX_HOST +
            ":" +
            FALIX_PORT
        );

        console.log(
            "Porta: " +
            PORT
        );
    }
);
