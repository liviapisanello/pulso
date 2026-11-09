/* =====================================================================
 * ESTADO CENTRAL + EVENTOS + FUNÇÕES DE APOIO
 * ---------------------------------------------------------------------
 * Tudo o que aparece na tela sai do objeto Pulso.estado.dados.
 * Quando algo muda, o processador "emite" um evento (ex.: "leitura")
 * e cada parte da tela que se inscreveu nele se redesenha.
 *
 * No modo AO VIVO o estado é salvo no localStorage do navegador
 * (chamados, histórico, confirmações). No modo DEMONSTRAÇÃO não é
 * salvo: o demo sempre recomeça do zero.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;

  /* ------------------------------------------------------------------
   * 1. EVENTOS (publicar / assinar)
   * ------------------------------------------------------------------ */
  const ouvintes = {};
  Pulso.eventos = {
    /** Inscreve uma função para ser chamada quando o evento acontecer. */
    on(nome, fn) {
      (ouvintes[nome] = ouvintes[nome] || []).push(fn);
    },
    /** Dispara o evento. Um erro numa parte da tela não derruba as outras. */
    emit(nome, dados) {
      (ouvintes[nome] || []).forEach((fn) => {
        try {
          fn(dados);
        } catch (erro) {
          console.error("[Pulso] erro no ouvinte de", nome, erro);
        }
      });
    },
  };

  /* ------------------------------------------------------------------
   * 2. TABELAS FIXAS
   * ------------------------------------------------------------------ */

  // As quatro camadas medidas, na ordem em que aparecem na tela.
  // "campo" é o nome do número na mensagem do ESP32.
  Pulso.CAMADAS = [
    { id: "calor",     nome: "Calor",     campo: "temp_c",    unidade: "°C",    casas: 1, feminino: false },
    { id: "luz",       nome: "Iluminação", campo: "lux",      unidade: "lx",    casas: 0, feminino: true },
    { id: "pavimento", nome: "Pavimento", campo: "impacto_g", unidade: "g",     casas: 2, feminino: false },
    { id: "ar",        nome: "Ar · PM2.5", campo: "pm25",     unidade: "µg/m³", casas: 0, feminino: false },
  ];

  // Nome curto da camada para frases do histórico ("luz crítica").
  Pulso.NOME_CURTO = { calor: "calor", luz: "luz", pavimento: "pavimento", ar: "ar" };

  // Gravidade de cada estado (para descobrir o "pior").
  const GRAVIDADE = { "---": 0, NORMAL: 1, ATENCAO: 2, CRITICO: 3 };

  // Texto que aparece na tela para cada estado.
  Pulso.TEXTO_ESTADO = {
    NORMAL: "Normal",
    ATENCAO: "Atenção",
    CRITICO: "Crítico",
    "---": "Não avaliado",
    FALHA: "Falha de sensor",
    SEM: "Sem dados",
  };

  // Ícone de cada estado.
  Pulso.ICONE_ESTADO = { NORMAL: "NORMAL", ATENCAO: "ATENCAO", CRITICO: "CRITICO", "---": "SEM", FALHA: "FALHA", SEM: "SEM" };

  /* ------------------------------------------------------------------
   * 3. FUNÇÕES DE APOIO
   * ------------------------------------------------------------------ */

  /**
   * Padroniza o texto de estado que chegou do ESP32.
   * Não recalcula nada: só aceita variações de escrita
   * ("Crítico", "atencao"...) e devolve a forma oficial.
   */
  Pulso.normalizarEstado = function (texto) {
    if (texto === null || texto === undefined) return "---";
    const t = String(texto).trim().toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, ""); // remove acentos
    if (t === "NORMAL" || t === "ATENCAO" || t === "CRITICO" || t === "FALHA") return t;
    return "---";
  };

  /** Pior estado entre as camadas (só ordena; não reclassifica). */
  Pulso.piorEstado = function (estados) {
    let pior = "---";
    Object.values(estados || {}).forEach((e) => {
      const n = Pulso.normalizarEstado(e);
      if ((GRAVIDADE[n] || 0) > GRAVIDADE[pior]) pior = n;
    });
    return pior;
  };

  /** Nome de classe CSS de um estado ("---" vira "NA" = não avaliado). */
  Pulso.classeEstado = function (estado) {
    return estado === "---" ? "NA" : estado || "SEM";
  };

  /** HTML de uma pílula de estado: cor + ícone + texto (nunca só cor). */
  Pulso.pilula = function (estado, texto) {
    return '<span class="pilula est-' + Pulso.classeEstado(estado) + '">' +
      Pulso.icone(Pulso.ICONE_ESTADO[estado] || "SEM") +
      (texto || Pulso.TEXTO_ESTADO[estado] || estado) + "</span>";
  };

  /** Formata número no padrão brasileiro. null vira "—". */
  Pulso.formatarNumero = function (valor, casas) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
    return Number(valor).toLocaleString("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
  };

  /** Dados de configuração de um trecho (rua, cenário...). */
  Pulso.trecho = function (id) {
    return CFG.trechos.find((t) => t.id === id) || null;
  };

  /** Posição do trecho na pista (0 a 5). -1 se não existir. */
  Pulso.indiceTrecho = function (id) {
    return CFG.trechos.findIndex((t) => t.id === id);
  };

  /** Trecho seguinte na pista em anel (depois do último volta ao primeiro). */
  Pulso.proximoTrecho = function (id) {
    const i = Pulso.indiceTrecho(id);
    if (i < 0) return null;
    return CFG.trechos[(i + 1) % CFG.trechos.length].id;
  };

  /** Ex.: "luz crítica", "calor em atenção". */
  Pulso.descreverCamada = function (camada, estado) {
    const fem = (Pulso.CAMADAS.find((c) => c.id === camada) || {}).feminino;
    const nome = Pulso.NOME_CURTO[camada] || camada;
    if (estado === "CRITICO") return nome + (fem ? " crítica" : " crítico");
    if (estado === "ATENCAO") return nome + " em atenção";
    return nome + " normal";
  };

  /** Evita que textos vindos de fora virem HTML na tela. */
  Pulso.escapar = function (texto) {
    return String(texto === null || texto === undefined ? "" : texto)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  /* ------------------------------------------------------------------
   * 4. O ESTADO
   * ------------------------------------------------------------------ */

  /** Estado vazio (usado no início e ao zerar). */
  function estadoVazio() {
    const trechos = {};
    const confirmacoes = {};
    CFG.trechos.forEach((t) => {
      // ultimaLeitura: última mensagem de "leituras" recebida deste trecho
      trechos[t.id] = { ultimaLeitura: null, pior: "SEM" };
      // confirmacoes[T02].luz = { passagens: [1,2] }
      confirmacoes[t.id] = {};
      Object.keys(CFG.chamados).forEach((camada) => {
        confirmacoes[t.id][camada] = { passagens: [] };
      });
    });
    return {
      trechos,
      confirmacoes,
      chamados: [],          // lista de chamados (mais novo primeiro)
      feed: [],              // linha do tempo (mais novo primeiro)
      onibusTrecho: null,    // trecho onde o ônibus está agora
      ultimoStatus: null,    // última mensagem de "status"
      proximoProtocolo: 1,   // numeração dos chamados (PUL-0001...)
      contadorLeituras: 0,   // total de leituras recebidas
    };
  }

  // Informações "de agora" que não fazem sentido salvar
  // (se a página recarregar, elas são recalculadas).
  function aoVivoVazio() {
    return {
      ultimoSinalEm: 0,         // horário (ms) da última mensagem do dispositivo
      esperandoDesde: 0,        // quando o painel começou a ouvir o broker
      online: null,             // null = ainda não sabemos; true/false
      broker: "desligado",      // situação da conexão com o broker MQTT
      ultimoMovimentoEm: 0,     // quando o ônibus andou por causa de uma leitura
      reconexao: { ativa: false, quantidade: 0, ultimaEm: 0 },
    };
  }

  const CHAVE_SALVAR = "pulso:v1:aovivo";
  let persistir = false;
  let temporizadorSalvar = null;

  Pulso.estado = {
    dados: estadoVazio(),
    aoVivo: aoVivoVazio(),

    /**
     * Liga/desliga o salvamento no navegador e carrega o que foi salvo.
     * Chamado pelo app ao trocar de modo.
     */
    usarPersistencia(ligar) {
      persistir = ligar;
      this.dados = estadoVazio();
      this.aoVivo = aoVivoVazio();
      if (!ligar) return;
      try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_SALVAR) || "null");
        if (salvo && salvo.trechos) {
          // Mistura com um estado vazio para tolerar mudanças no config
          // (ex.: um trecho novo que não existia quando foi salvo).
          const base = estadoVazio();
          Object.keys(base.trechos).forEach((id) => {
            if (salvo.trechos[id]) base.trechos[id] = salvo.trechos[id];
            if (salvo.confirmacoes && salvo.confirmacoes[id]) {
              Object.keys(base.confirmacoes[id]).forEach((camada) => {
                const c = salvo.confirmacoes[id][camada];
                if (c && Array.isArray(c.passagens)) base.confirmacoes[id][camada] = c;
              });
            }
          });
          base.chamados = Array.isArray(salvo.chamados) ? salvo.chamados : [];
          base.feed = Array.isArray(salvo.feed) ? salvo.feed : [];
          base.onibusTrecho = salvo.onibusTrecho || null;
          base.ultimoStatus = salvo.ultimoStatus || null;
          base.proximoProtocolo = salvo.proximoProtocolo || 1;
          base.contadorLeituras = salvo.contadorLeituras || 0;
          this.dados = base;
        }
      } catch (erro) {
        console.warn("[Pulso] não foi possível ler o estado salvo", erro);
      }
    },

    /** Agenda um salvamento (junta várias mudanças seguidas em uma só escrita). */
    salvar() {
      if (!persistir) return;
      clearTimeout(temporizadorSalvar);
      temporizadorSalvar = setTimeout(() => {
        try {
          localStorage.setItem(CHAVE_SALVAR, JSON.stringify(this.dados));
        } catch (erro) {
          console.warn("[Pulso] não foi possível salvar", erro);
        }
      }, 300);
    },

    /** Apaga tudo (botão/atalho "zerar"). */
    zerar() {
      const { broker } = this.aoVivo; // a conexão MQTT continua de pé
      this.dados = estadoVazio();
      this.aoVivo = aoVivoVazio();
      this.aoVivo.broker = broker;
      if (broker === "conectado") this.aoVivo.esperandoDesde = Date.now();
      if (persistir) {
        try {
          localStorage.removeItem(CHAVE_SALVAR);
        } catch (erro) { /* navegador sem acesso ao armazenamento: tudo bem */ }
      }
      Pulso.eventos.emit("zerar");
    },
  };
})();
