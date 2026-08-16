const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const dns = require("dns").promises;
const net = require("net");

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

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
    res.status(200).send("Eaglercraft WSS Proxy online");
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

const wss = new WebSocket.Server({
    noServer: true,
    perMessageDeflate: false
});

async function resolveIPv4(host) {
    const addresses = await dns.resolve4(host);

    if (!addresses || addresses.length === 0) {
        throw new Error("Nenhum IP encontrado para " + host);
    }

    return addresses;
}

async function getServerTarget(pathname) {
    let host;
    let port;
    let name;

    if (pathname === "/aternos") {
        host = ATERNOS_HOST;
        port = ATERNOS_PORT;
        name = "Aternos";
    } else if (pathname === "/falix") {
        host = FALIX_HOST;
        port = FALIX_PORT;
        name = "Falix";
    } else {
        throw new Error(
            "Caminho inválido. Use /aternos ou /falix."
        );
    }

    const ips = await resolveIPv4(host);

    return {
        name,
        host,
        port,
        ip: ips[0]
    };
}

function connectTCP(target) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();

        let finished = false;

        function fail(error) {
            if (finished) {
                return;
            }

            finished = true;

            try {
                socket.destroy();
            } catch (_) {}

            reject(error);
        }

        socket.setTimeout(10000);

        socket.once("connect", () => {
            if (finished) {
                return;
            }

            finished = true;

            socket.setTimeout(0);

            resolve(socket);
        });

        socket.once("timeout", () => {
            fail(
                new Error(
                    "Timeout ao conectar em " +
                    target.host +
                    ":" +
                    target.port
                )
            );
        });

        socket.once("error", (error) => {
            fail(error);
        });

        socket.connect(
            target.port,
            target.ip
        );
    });
}

server.on("upgrade", async (req, socket, head) => {
    try {
        const url = new URL(
            req.url,
            "http://" + req.headers.host
        );

        const pathname = url.pathname;

        if (
            pathname !== "/aternos" &&
            pathname !== "/falix"
        ) {
            socket.write(
                "HTTP/1.1 404 Not Found\r\n" +
                "Connection: close\r\n" +
                "\r\n"
            );

            socket.destroy();
            return;
        }

        wss.handleUpgrade(
            req,
            socket,
            head,
            (ws) => {
                wss.emit(
                    "connection",
                    ws,
                    req,
                    pathname
                );
            }
        );

    } catch (error) {
        try {
            socket.destroy();
        } catch (_) {}
    }
});

wss.on(
    "connection",
    async (ws, req, pathname) => {

        let tcp = null;
        let closed = false;

        function closeEverything() {
            if (closed) {
                return;
            }

            closed = true;

            try {
                if (tcp) {
                    tcp.destroy();
                }
            } catch (_) {}

            try {
                if (
                    ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING
                ) {
                    ws.close();
                }
            } catch (_) {}
        }

        try {
            const target =
                await getServerTarget(pathname);

            console.log(
                "Nova conexão EagleCraft -> " +
                target.name +
                " " +
                target.host +
                ":" +
                target.port
            );

            console.log(
                "IP resolvido: " +
                target.ip
            );

            tcp = await connectTCP(target);

            console.log(
                target.name +
                " TCP conectado"
            );

            tcp.on("data", (data) => {
                if (
                    closed ||
                    ws.readyState !== WebSocket.OPEN
                ) {
                    return;
                }

                try {
                    ws.send(data);
                } catch (error) {
                    closeEverything();
                }
            });

            tcp.on("error", (error) => {
                console.error(
                    "Erro TCP " +
                    target.name +
                    ": " +
                    error.message
                );

                closeEverything();
            });

            tcp.on("close", () => {
                closeEverything();
            });

            ws.on("message", (data, isBinary) => {
                if (
                    closed ||
                    !tcp ||
                    tcp.destroyed
                ) {
                    return;
                }

                try {
                    if (Buffer.isBuffer(data)) {
                        tcp.write(data);
                    } else if (data instanceof ArrayBuffer) {
                        tcp.write(
                            Buffer.from(data)
                        );
                    } else if (
                        Array.isArray(data)
                    ) {
                        tcp.write(
                            Buffer.concat(data)
                        );
                    } else {
                        tcp.write(
                            Buffer.from(data)
                        );
                    }
                } catch (error) {
                    console.error(
                        "Erro enviando para Minecraft: " +
                        error.message
                    );

                    closeEverything();
                }
            });

            ws.on("close", () => {
                closeEverything();
            });

            ws.on("error", (error) => {
                console.error(
                    "Erro WebSocket: " +
                    error.message
                );

                closeEverything();
            });

        } catch (error) {
            console.error(
                "Falha ao conectar " +
                pathname +
                ": " +
                error.message
            );

            try {
                ws.close(
                    1011,
                    "Servidor indisponível"
                );
            } catch (_) {}

            try {
                if (tcp) {
                    tcp.destroy();
                }
            } catch (_) {}
        }
    }
);

process.on("uncaughtException", (error) => {
    console.error(
        "Erro inesperado: " +
        error.message
    );
});

process.on("unhandledRejection", (error) => {
    console.error(
        "Promise rejeitada: " +
        (error && error.message
            ? error.message
            : error)
    );
});

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

        console.log(
            "WSS Aternos: /aternos"
        );

        console.log(
            "WSS Falix: /falix"
        );
    }
);
