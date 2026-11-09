/* =====================================================================
 * PROCESSADOR DE MENSAGENS
 * ---------------------------------------------------------------------
 * Recebe as mensagens do ESP32 (reais via MQTT ou simuladas no demo),
 * atualiza o estado e avisa a tela.
 *
 * REGRA DE OURO: quem classifica NORMAL / ATENCAO / CRITICO é o ESP32.
 * Aqui só exibimos e contamos; nunca recalculamos estados.
 *
 * As duas portas de entrada são:
 *   Pulso.processador.leitura(objeto)  -> tópico .../leituras
 *   Pulso.processador.status(objeto)   -> tópico .../status
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;
  const E = () => Pulso.estado.dados;    // atalho para o estado salvo
  const V = () => Pulso.estado.aoVivo;   // atalho para o estado "de agora"

  // Por quantos segundos sem novas leituras atrasadas a "rajada" da reconexão termina.
  const FIM_DA_RAJADA_MS = 4000;
  // Depois que uma leitura move o ônibus, ignoramos o trecho do status por
  // este tempo (o status pode ter sido enviado um instante antes da leitura).
  const STATUS_IGNORADO_APOS_LEITURA_MS = 4000;
  const MAX_FEED = 60;

  /* ------------------------------------------------------------------
   * LINHA DO TEMPO
   * ------------------------------------------------------------------ */
  let seqFeed = 0;
  function adicionarAoFeed(item) {
    item.id = Date.now() + "-" + seqFeed++;
    E().feed.unshift(item);
    if (E().feed.length > MAX_FEED) E().feed.length = MAX_FEED;
    Pulso.eventos.emit("feed", item);
  }

  /** Hora para eventos do sistema: usa a hora do dispositivo, se houver. */
  function horaAtual() {
    const s = E().ultimoStatus;
    if (s && s.hora) return s.hora;
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ------------------------------------------------------------------
   * SINAL DE VIDA / ONLINE-OFFLINE
   * ------------------------------------------------------------------ */
  function registrarSinalDeVida() {
    V().ultimoSinalEm = Date.now();
    if (V().online !== true) {
      const estavaOffline = V().online === false;
      V().online = true;
      if (estavaOffline) {
        adicionarAoFeed({ tipo: "conexao", nivel: "NORMAL", hora: horaAtual(), partes: ["Sinal voltou · dispositivo online"] });
      }
      Pulso.eventos.emit("conexao");
    }
  }

  /** Roda a cada segundo: passou do limite sem notícias = offline. */
  function verificarOffline() {
    const v = V();
    // Painel pronto para ouvir (broker conectado) mas o dispositivo nunca
    // falou: depois do mesmo limite, também é "offline".
    if (v.online === null && v.esperandoDesde &&
        (Date.now() - v.esperandoDesde) / 1000 > CFG.segundosParaOffline) {
      v.online = false;
      v.ultimoSinalEm = v.esperandoDesde;
      adicionarAoFeed({ tipo: "conexao", nivel: "CRITICO", hora: horaAtual(), partes: ["Nenhum sinal do dispositivo"] });
      Pulso.eventos.emit("conexao");
    }
    if (v.ultimoSinalEm && v.online) {
      const passou = (Date.now() - v.ultimoSinalEm) / 1000;
      if (passou > CFG.segundosParaOffline) {
        v.online = false;
        adicionarAoFeed({ tipo: "conexao", nivel: "CRITICO", hora: horaAtual(), partes: ["Dispositivo sem sinal · guardando leituras"] });
        Pulso.eventos.emit("conexao");
      }
    }
    // Fim da rajada de leituras atrasadas
    const r = v.reconexao;
    if (r.ativa && Date.now() - r.ultimaEm > FIM_DA_RAJADA_MS) {
      r.ativa = false;
      adicionarAoFeed({
        tipo: "conexao", nivel: "NORMAL", hora: horaAtual(),
        partes: [r.quantidade + (r.quantidade === 1 ? " leitura recebida" : " leituras recebidas") + " após reconexão"],
      });
      Pulso.eventos.emit("reconexao", { ...r });
      r.quantidade = 0;
    }
    Pulso.eventos.emit("tique"); // para contadores do tipo "há 23 s"
  }
  setInterval(verificarOffline, 1000);

  /* ------------------------------------------------------------------
   * ÔNIBUS NO MAPA
   * ------------------------------------------------------------------ */
  function moverOnibus(para, motivo) {
    if (!para || Pulso.indiceTrecho(para) < 0) return;
    const de = E().onibusTrecho;
    if (de === para) return;
    E().onibusTrecho = para;
    if (motivo === "leitura") V().ultimoMovimentoEm = Date.now();
    Pulso.eventos.emit("onibus", { de, para });
  }

  /* ------------------------------------------------------------------
   * CONFIRMAÇÕES E CHAMADOS
   * ------------------------------------------------------------------ */

  /** Existe chamado ainda não resolvido para este trecho e tipo? */
  function chamadoAberto(trecho, camada) {
    return E().chamados.find((c) => c.trecho === trecho && c.camada === camada && c.status !== "resolvido");
  }

  /**
   * Conta passagens que confirmaram um problema.
   * - CRITICO numa passagem nova: soma 1 (a mesma passagem nunca conta duas vezes).
   * - NORMAL: o problema sumiu, a contagem volta a zero
   *   (a não ser que já exista chamado aberto: aí espera a equipe resolver).
   * - ATENCAO ou "---" (não avaliado): não muda nada.
   * Devolve a lista de camadas cuja contagem mudou.
   */
  function atualizarConfirmacoes(leitura, idPassagem) {
    const conf = E().confirmacoes[leitura.trecho];
    const limite = CFG.confirmacoesParaChamado;
    const novosChamados = [];

    Object.keys(CFG.chamados).forEach((camada) => {
      const estado = leitura.estados[camada];
      const c = conf[camada];
      if (estado === "CRITICO") {
        if (!c.passagens.includes(idPassagem) && c.passagens.length < limite) {
          c.passagens.push(idPassagem);
        }
        if (c.passagens.length >= limite && !chamadoAberto(leitura.trecho, camada)) {
          novosChamados.push(abrirChamado(leitura, camada, c.passagens.slice()));
        }
      } else if (estado === "NORMAL" && !chamadoAberto(leitura.trecho, camada)) {
        c.passagens = [];
      }
    });
    return novosChamados;
  }

  function abrirChamado(leitura, camada, passagens) {
    const info = CFG.chamados[camada];
    const t = Pulso.trecho(leitura.trecho);
    const numero = E().proximoProtocolo++;
    const chamado = {
      id: "c" + Date.now() + "-" + numero,
      protocolo: "PUL-" + String(numero).padStart(4, "0"),
      trecho: leitura.trecho,
      rua: t ? t.rua : leitura.nome,
      camada,
      titulo: info.titulo,
      orgao: info.orgao,
      status: "aberto",            // aberto -> atendimento -> resolvido
      hora: leitura.hora || horaAtual(),
      passagens,
      criadoEm: Date.now(),
    };
    E().chamados.unshift(chamado);
    return chamado; // entra na linha do tempo logo depois da leitura que o gerou
  }

  const TEXTO_STATUS_CHAMADO = { aberto: "Aberto", atendimento: "Em atendimento", resolvido: "Resolvido" };

  /** Muda a situação de um chamado (botões e atalho de teclado). */
  function definirStatusChamado(id, novo) {
    const c = E().chamados.find((x) => x.id === id);
    if (!c || c.status === novo) return;
    c.status = novo;
    c.atualizadoEm = Date.now();
    if (novo === "resolvido") {
      // Problema resolvido: a contagem do trecho recomeça do zero.
      const conf = E().confirmacoes[c.trecho];
      if (conf && conf[c.camada]) conf[c.camada].passagens = [];
    }
    adicionarAoFeed({
      tipo: "chamado", nivel: novo === "resolvido" ? "NORMAL" : "ATENCAO", hora: horaAtual(),
      trecho: c.trecho, rua: c.rua,
      partes: [c.titulo + " " + TEXTO_STATUS_CHAMADO[novo].toLowerCase(), c.protocolo],
    });
    Pulso.estado.salvar();
    Pulso.eventos.emit("chamado:atualizado", c);
    Pulso.eventos.emit("confirmacoes");
  }

  /** Avança o chamado mais recente que ainda não foi resolvido (atalho A). */
  function avancarChamado() {
    const lista = E().chamados;
    // A lista já está do mais novo para o mais antigo.
    const alvo = lista.find((c) => c.status !== "resolvido");
    if (!alvo) return;
    definirStatusChamado(alvo.id, alvo.status === "aberto" ? "atendimento" : "resolvido");
  }

  /* ------------------------------------------------------------------
   * TÓPICO "leituras"
   * ------------------------------------------------------------------ */
  function processarLeitura(msg) {
    if (!msg || typeof msg !== "object") return;
    const trecho = String(msg.trecho || "").toUpperCase();
    if (Pulso.indiceTrecho(trecho) < 0) {
      console.warn("[Pulso] leitura de trecho desconhecido ignorada:", msg.trecho);
      return;
    }

    // Copia a mensagem padronizando os textos de estado.
    const estados = {};
    Pulso.CAMADAS.forEach((c) => {
      estados[c.id] = Pulso.normalizarEstado(msg.estados ? msg.estados[c.id] : null);
    });
    const leitura = { ...msg, trecho, estados, recebidaEm: Date.now() };
    const atrasada = msg.enviado_offline === true;

    registrarSinalDeVida();
    E().contadorLeituras++;

    // Identificador da passagem (se o ESP32 não mandar, usamos um contador local).
    const idPassagem = msg.passagem !== undefined && msg.passagem !== null
      ? msg.passagem
      : "local-" + E().contadorLeituras;

    // 1. Pinta o trecho com o pior estado desta passagem.
    //    Uma leitura atrasada só substitui se não for mais velha que a atual.
    const atual = E().trechos[trecho].ultimaLeitura;
    const maisVelha = atrasada && atual && typeof atual.passagem === "number" &&
      typeof msg.passagem === "number" && msg.passagem < atual.passagem;
    if (!maisVelha) {
      E().trechos[trecho] = { ultimaLeitura: leitura, pior: Pulso.piorEstado(estados) };
    }

    // 2. Confirmações e possíveis chamados.
    const novos = atualizarConfirmacoes(leitura, idPassagem);

    // 3. Linha do tempo (a leitura e, acima dela, os chamados que ela abriu).
    adicionarAoFeed(montarItemDoFeed(leitura, atrasada));
    novos.forEach((c) => adicionarAoFeed({
      tipo: "chamado", nivel: "CHAMADO", hora: c.hora, trecho: c.trecho, rua: c.rua,
      partes: ["Chamado aberto: " + c.titulo, c.protocolo],
    }));

    // 4. Reconexão: conta as leituras atrasadas que estão chegando.
    if (atrasada) {
      const r = V().reconexao;
      r.ativa = true;
      r.quantidade++;
      r.ultimaEm = Date.now();
      Pulso.eventos.emit("reconexao", { ...r });
    }

    // 5. Ônibus: terminou este trecho, então está no próximo.
    //    Leituras atrasadas não movem o ônibus (são do passado).
    if (!atrasada) moverOnibus(Pulso.proximoTrecho(trecho), "leitura");

    Pulso.estado.salvar();
    Pulso.eventos.emit("leitura", leitura);
    Pulso.eventos.emit("confirmacoes");
    novos.forEach((c) => Pulso.eventos.emit("chamado:novo", c));
  }

  /** Monta a frase "21:40 · T02 R Augusta · luz crítica · 2/3". */
  function montarItemDoFeed(leitura, atrasada) {
    const t = Pulso.trecho(leitura.trecho);
    const partes = [];
    const problemas = Pulso.CAMADAS
      .filter((c) => leitura.estados[c.id] === "CRITICO" || leitura.estados[c.id] === "ATENCAO")
      .sort((a, b) => (leitura.estados[a.id] === "CRITICO" ? -1 : 1) - (leitura.estados[b.id] === "CRITICO" ? -1 : 1));

    if (problemas.length === 0) {
      partes.push("tudo normal");
    } else {
      partes.push(problemas.map((c) => Pulso.descreverCamada(c.id, leitura.estados[c.id])).join(", "));
    }
    // Contagem de confirmação da primeira camada que gera chamado e está crítica.
    const camadaChamado = Object.keys(CFG.chamados).find((c) => leitura.estados[c] === "CRITICO");
    if (camadaChamado) {
      const n = E().confirmacoes[leitura.trecho][camadaChamado].passagens.length;
      partes.push(n + "/" + CFG.confirmacoesParaChamado);
    }
    return {
      tipo: "leitura",
      nivel: Pulso.piorEstado(leitura.estados),
      hora: leitura.hora || horaAtual(),
      trecho: leitura.trecho,
      rua: t ? t.rua : leitura.nome,
      partes,
      atrasada,
    };
  }

  /* ------------------------------------------------------------------
   * TÓPICO "status"
   * ------------------------------------------------------------------ */
  function processarStatus(msg) {
    if (!msg || typeof msg !== "object") return;
    const anterior = E().ultimoStatus;
    const status = { ...msg, geral: Pulso.normalizarEstado(msg.geral), recebidoEm: Date.now() };
    if (status.trecho) status.trecho = String(status.trecho).toUpperCase();
    E().ultimoStatus = status;
    registrarSinalDeVida();

    // Falha de sensor entra na linha do tempo uma vez (quando começa).
    const falhou = status.falha_sensor === true || status.geral === "FALHA";
    const falhavaAntes = anterior && (anterior.falha_sensor === true || anterior.geral === "FALHA");
    if (falhou && !falhavaAntes) {
      const t = Pulso.trecho(status.trecho);
      adicionarAoFeed({ tipo: "falha", nivel: "FALHA", hora: status.hora || horaAtual(), trecho: status.trecho,
        rua: t ? t.rua : "", partes: ["falha de sensor"] });
    }

    // O ônibus segue o trecho informado no status, exceto logo depois
    // de uma leitura (o status pode estar um passo atrasado).
    if (status.trecho && Date.now() - V().ultimoMovimentoEm > STATUS_IGNORADO_APOS_LEITURA_MS) {
      moverOnibus(status.trecho, "status");
    }

    Pulso.estado.salvar();
    Pulso.eventos.emit("status", status);
  }

  /** Lê um texto JSON com segurança (mensagem quebrada não derruba o painel). */
  function lerJSON(texto) {
    try {
      return JSON.parse(texto);
    } catch (erro) {
      console.warn("[Pulso] mensagem que não é JSON ignorada:", texto);
      return null;
    }
  }

  Pulso.processador = {
    leitura: processarLeitura,
    status: processarStatus,
    lerJSON,
    definirStatusChamado,
    avancarChamado,
    TEXTO_STATUS_CHAMADO,
  };
})();
