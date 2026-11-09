/* =====================================================================
 * CONEXÃO MQTT (modo ao vivo)
 * ---------------------------------------------------------------------
 * O navegador não fala MQTT "puro"; ele usa MQTT sobre WebSocket
 * seguro (wss://). O HiveMQ público aceita isso na porta 8884.
 * A biblioteca mqtt.js (pasta vendor/) cuida da conexão e reconecta
 * sozinha se a internet cair.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;
  let cliente = null;

  function definirBroker(situacao) {
    if (Pulso.estado.aoVivo.broker === situacao) return;
    Pulso.estado.aoVivo.broker = situacao;
    Pulso.eventos.emit("conexao");
  }

  Pulso.conexao = {
    ligar() {
      if (cliente) return;
      if (!window.mqtt) {
        console.error("[Pulso] biblioteca MQTT não carregou (vendor/mqtt.min.js)");
        definirBroker("erro");
        return;
      }
      definirBroker("conectando");

      // Cada aba precisa de um id diferente, senão o broker derruba a outra.
      const clientId = "pulso-painel-" + Math.random().toString(16).slice(2, 10);
      cliente = window.mqtt.connect(CFG.mqtt.url, {
        clientId,
        clean: true,
        keepalive: 30,
        reconnectPeriod: 2000,  // tenta reconectar a cada 2 s
        connectTimeout: 10000,
      });

      cliente.on("connect", () => {
        // Começa a contar os 15 s de "nenhum sinal" a partir daqui.
        if (!Pulso.estado.aoVivo.esperandoDesde) Pulso.estado.aoVivo.esperandoDesde = Date.now();
        definirBroker("conectado");
        cliente.subscribe([CFG.mqtt.topicoLeituras, CFG.mqtt.topicoStatus], { qos: 0 }, (erro) => {
          if (erro) console.error("[Pulso] erro ao assinar tópicos", erro);
          else console.info("[Pulso] assinando", CFG.mqtt.topicoLeituras, "e", CFG.mqtt.topicoStatus);
        });
      });
      cliente.on("reconnect", () => definirBroker("reconectando"));
      cliente.on("offline", () => definirBroker("reconectando"));
      cliente.on("error", (erro) => {
        console.warn("[Pulso] erro MQTT", erro && erro.message);
        definirBroker("erro");
      });

      cliente.on("message", (topico, payload) => {
        const msg = Pulso.processador.lerJSON(payload.toString());
        if (!msg) return;
        if (topico === CFG.mqtt.topicoLeituras) Pulso.processador.leitura(msg);
        else if (topico === CFG.mqtt.topicoStatus) Pulso.processador.status(msg);
      });
    },

    desligar() {
      if (!cliente) return;
      cliente.end(true);
      cliente = null;
      definirBroker("desligado");
    },
  };
})();
