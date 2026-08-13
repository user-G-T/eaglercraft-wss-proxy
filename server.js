const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const dns = require('dns').promises;

// =====================================================
// CONFIGURAÇÃO
// =====================================================

// Endereço PERMANENTE do seu servidor Aternos.
// NÃO coloque o DynIP (.aternos.host) aqui.
const ATERNOS_DOMAIN = 'mundoeterno_etec.aternos.me';

// Registro SRV usado pelo Minecraft/Aternos.
const SRV_RECORD = `_minecraft._tcp.${ATERNOS_DOMAIN}`;

// Porta do servidor Render.
// O Render fornece process.env.PORT automaticamente.
const PROXY_PORT = process.env.PORT || 10000;

// =====================================================
// SERVIDOR HTTP
// =====================================================

const app = express();
const server = http.createServer(app);

// Só para quando você abrir o link no navegador.
app.get('/', (req, res) => {
    res.send('Eaglercraft WSS Proxy online!');
});

// =====================================================
// PROXY
// =====================================================

const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true
});

// =====================================================
// DESCOBRIR SERVIDOR ATUAL DO ATERNOS
// =====================================================

async function getAternosTarget() {
    console.log(`🔎 Consultando DNS SRV: ${SRV_RECORD}`);

    const records = await dns.resolveSrv(SRV_RECORD);

    if (!records || records.length === 0) {
        throw new Error('Nenhum registro SRV encontrado para o servidor Aternos.');
    }

    // Ordena pela prioridade, como manda o funcionamento de SRV.
    records.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }

        return b.weight - a.weight;
    });

    const record = records[0];

    const hostname = record.name.replace(/\.$/, '');
    const port = record.port;

    console.log('✅ Aternos encontrado:');
    console.log(`   Host: ${hostname}`);
    console.log(`   Porta: ${port}`);

    return {
        hostname,
        port,
        target: `ws://${hostname}:${port}`
    };
}

// =====================================================
// WEBSOCKET
// =====================================================

server.on('upgrade', async (req, socket, head) => {
    console.log('');
    console.log('========================================');
    console.log('📡 Nova conexão WebSocket recebida');
    console.log('========================================');

    try {
        // Descobre o destino ATUAL do Aternos.
        const destination = await getAternosTarget();

        console.log(`🔗 Conectando em: ${destination.target}`);

        proxy.ws(
            req,
            socket,
            head,
            {
                target: destination.target,
                ws: true,
                changeOrigin: true
            },
            (error) => {
                console.error('❌ Erro ao conectar no Aternos:', error);

                try {
                    socket.destroy();
                } catch {}
            }
        );

    } catch (error) {
        console.error('❌ Não foi possível descobrir o servidor Aternos.');
        console.error(error);

        try {
            socket.destroy();
        } catch {}
    }
});

// =====================================================
// ERROS DO PROXY
// =====================================================

proxy.on('error', (err) => {
    console.error('❌ Proxy Error:', err.message);
});

// =====================================================
// INICIAR
// =====================================================

server.listen(PROXY_PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('🚀 Eaglercraft WSS Proxy iniciado');
    console.log('========================================');
    console.log(`Porta Render: ${PROXY_PORT}`);
    console.log(`Aternos: ${ATERNOS_DOMAIN}`);
    console.log(`SRV: ${SRV_RECORD}`);
    console.log('========================================');
});
