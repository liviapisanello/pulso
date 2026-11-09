/* =====================================================================
 * SIMULADOR DO ESP32 (modo demonstração)
 * ---------------------------------------------------------------------
 * Imita o dispositivo de verdade: o ônibus passa pelos 6 trechos,
 * manda "status" de tempos em tempos e uma "leitura" ao terminar cada
 * trecho, sempre no MESMO formato JSON do ESP32.
 *
 * Roteiro (ajustável em config.js -> demo):
 *   Volta 1: tudo normal na conexão; problemas aparecem (1/3).
 *   Volta 2: o sinal cai no T03; as leituras ficam no buffer e são
 *            enviadas de uma vez quando o sinal volta (2/3).
 *   Volta 3: 3ª confirmação -> nascem os chamados "Poste apagado"
 *            (T02) e "Buraco" (T04). Um sensor falha por um instante.
 *   Depois disso o ônibus continua dando voltas.
 *
 * O simulador não conhece a tela: ele só chama a função "enviar"
 * que recebe. No painel ela entrega direto ao processador; na página
 * testar-mqtt.html ela publica no broker MQTT de verdade.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  /* Valores "típicos" de cada cenário da maquete e como o ESP32 os
   * classificaria. Os estados já vêm prontos, como viriam do ESP32. */
  const CENARIOS = {
    T01: { temp_c: 26.4, umid: 58, lux: 140, impacto_g: 0.15, pm25: 14,
           estados: { calor: "NORMAL", luz: "NORMAL", pavimento: "NORMAL", ar: "NORMAL" } },
    T02: { temp_c: 25.1, umid: 63, lux: 3, impacto_g: 0.12, pm25: 18,
           estados: { calor: "NORMAL", luz: "CRITICO", pavimento: "NORMAL", ar: "NORMAL" } },
    T03: { temp_c: 39.6, umid: 34, lux: 220, impacto_g: 0.18, pm25: 16,
           estados: { calor: "CRITICO", luz: "NORMAL", pavimento: "NORMAL", ar: "NORMAL" } },
    T04: { temp_c: 27.2, umid: 55, lux: 95, impacto_g: 2.64, pm25: 21,
           estados: { calor: "NORMAL", luz: "NORMAL", pavimento: "CRITICO", ar: "NORMAL" } },
    T05: { temp_c: 33.1, umid: 47, lux: 160, impacto_g: 0.22, pm25: 64,
           estados: { calor: "ATENCAO", luz: "NORMAL", pavimento: "NORMAL", ar: "CRITICO" } },
    T06: { temp_c: 25.8, umid: 60, lux: 180, impacto_g: 0.1, pm25: 9,
           estados: { calor: "NORMAL", luz: "NORMAL", pavimento: "NORMAL", ar: "NORMAL" } },
  };
  const NORMAL_PADRAO = CENARIOS.T01;

  const ORDEM = { "---": 0, NORMAL: 1, ATENCAO: 2, CRITICO: 3 };

  /** Pequena variação para os números parecerem medidos de verdade. */
  function ruido(valor, porcento, casas) {
    if (valor === null) return null;
    const v = valor * (1 + (Math.random() * 2 - 1) * porcento);
    const f = Math.pow(10, casas);
    return Math.round(v * f) / f;
  }

  /** Soma minutos a uma hora "HH:MM". */
  function somarMinutos(hora, minutos) {
    const [h, m] = hora.split(":").map(Number);
    const total = (h * 60 + m + minutos) % (24 * 60);
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  /**
   * Cria um simulador.
   * @param {object}   cfg     o PULSO_CONFIG
   * @param {function} enviar  enviar("leituras" | "status", objeto)
   */
  Pulso.criarSimulador = function (cfg, enviar) {
    const D = cfg.demo;
    const IDS = cfg.trechos.map((t) => t.id);
    const TICK_MS = 100;

    let s; // estado interno do simulador
    let intervalo = null;

    function reiniciar() {
      s = {
        volta: 1,
        idx: 0,                 // trecho atual (posição em IDS)
        msNoTrecho: 0,
        msDesdeStatus: 0,
        minutos: 0,             // minutos desde a hora inicial
        semSinal: false,
        msSemSinal: 0,
        jaCaiuOSinal: false,
        buffer: [],             // leituras guardadas sem sinal
        fila: [],               // leituras atrasadas aguardando envio
        msDesdeEnvioFila: 0,
        velocidade: 1,
        pausado: false,
        primeiroStatus: true,
      };
    }

    function idAtual() { return IDS[s.idx]; }
    function hora() { return somarMinutos(D.horaInicial, s.minutos); }

    /** Valores do cenário do trecho, com a falha de sensor do roteiro. */
    function medir(id) {
      const c = CENARIOS[id] || NORMAL_PADRAO;
      const estados = { ...c.estados };
      const m = {
        temp_c: ruido(c.temp_c, 0.02, 1),
        umid: Math.round(ruido(c.umid, 0.04, 0)),
        lux: c.lux < 10 ? Math.max(0, Math.round(c.lux + (Math.random() * 2 - 1))) : Math.round(ruido(c.lux, 0.05, 0)),
        impacto_g: ruido(c.impacto_g, 0.08, 2),
        pm25: Math.round(ruido(c.pm25, 0.06, 0)),
      };
      // Falha de sensor: o termômetro para de responder no último trecho da volta escolhida.
      const falha = D.falhaDeSensorNaVolta > 0 && s.volta === D.falhaDeSensorNaVolta && s.idx === IDS.length - 1;
      if (falha) {
        m.temp_c = null;
        m.umid = null;
        estados.calor = "---";
      }
      return { m, estados, falha };
    }

    function pior(estados) {
      return Object.values(estados).reduce((a, b) => (ORDEM[b] > ORDEM[a] ? b : a), "---");
    }

    function mandarStatus() {
      const id = idAtual();
      const { m, estados, falha } = medir(id);
      enviar("status", {
        dispositivo: "pulso001",
        trecho: id,
        hora: hora(),
        temp_c: m.temp_c,
        lux: m.lux,
        impacto_g: m.impacto_g,
        pm25: m.pm25,
        geral: falha ? "FALHA" : pior(estados),
        falha_sensor: falha,
        buffer: s.buffer.length + s.fila.length,
      });
    }

    /** Fim de um trecho: monta a leitura e envia (ou guarda, se sem sinal). */
    function terminarTrecho() {
      const id = idAtual();
      const t = cfg.trechos[s.idx];
      const { m, estados } = medir(id);
      const leitura = {
        dispositivo: "pulso001",
        trecho: id,
        nome: t.rua,
        passagem: s.volta,
        hora: hora(),
        temp_c: m.temp_c,
        umid: m.umid,
        lux: m.lux,
        impacto_g: m.impacto_g,
        pm25: m.pm25,
        estados,
        enviado_offline: false,
      };
      if (s.semSinal) {
        leitura.enviado_offline = true;
        s.buffer.push(leitura);
      } else {
        enviar("leituras", leitura);
      }
      // Avança para o próximo trecho.
      s.idx = (s.idx + 1) % IDS.length;
      if (s.idx === 0) s.volta++;
      s.minutos++;
      s.msNoTrecho = 0;
    }

    function passo() {
      if (s.pausado) return;
      const dt = TICK_MS * s.velocidade;
      s.msNoTrecho += dt;
      s.msDesdeStatus += dt;

      if (s.primeiroStatus) {
        s.primeiroStatus = false;
        mandarStatus();
      }

      // Queda de sinal programada.
      if (!s.jaCaiuOSinal && s.volta === D.voltaComFalhaDeSinal &&
          idAtual() === D.trechoQueCaiOSinal && s.msNoTrecho >= 1000) {
        s.jaCaiuOSinal = true;
        s.semSinal = true;
        s.msSemSinal = D.trechosSemSinal * D.segundosPorTrecho * 1000;
      }
      if (s.semSinal) {
        s.msSemSinal -= dt;
        if (s.msSemSinal <= 0) {
          // Sinal voltou: primeiro o status (com o tamanho do buffer),
          // depois as leituras guardadas, uma a uma.
          s.semSinal = false;
          s.fila = s.buffer;
          s.buffer = [];
          mandarStatus();
          s.msDesdeStatus = 0;
          s.msDesdeEnvioFila = 0;
        }
      }

      // Esvazia a fila de leituras atrasadas (uma a cada 0,4 s).
      if (s.fila.length) {
        s.msDesdeEnvioFila += TICK_MS;
        if (s.msDesdeEnvioFila >= 400) {
          s.msDesdeEnvioFila = 0;
          enviar("leituras", s.fila.shift());
        }
      }

      if (s.msDesdeStatus >= D.segundosEntreStatus * 1000) {
        s.msDesdeStatus = 0;
        if (!s.semSinal) mandarStatus();
      }

      if (s.msNoTrecho >= D.segundosPorTrecho * 1000) terminarTrecho();
    }

    reiniciar();

    return {
      iniciar() {
        if (!intervalo) intervalo = setInterval(passo, TICK_MS);
      },
      parar() {
        clearInterval(intervalo);
        intervalo = null;
      },
      reiniciar() {
        const vel = s.velocidade;
        reiniciar();
        s.velocidade = vel;
      },
      alternarPausa() {
        s.pausado = !s.pausado;
        return s.pausado;
      },
      definirVelocidade(v) {
        s.velocidade = Math.max(0.25, Math.min(8, v));
      },
      get rodando() { return !!intervalo; },
      get pausado() { return s.pausado; },
      get volta() { return s.volta; },
      get semSinal() { return s.semSinal; },
    };
  };
})();
