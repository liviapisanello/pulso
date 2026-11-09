/* =====================================================================
 * PAINÉIS DAS TELAS
 * ---------------------------------------------------------------------
 *  Cabeçalho ... conexão (único lugar do alerta de sinal), hora,
 *                 número de chamados abertos na aba
 *  1 · Linha .... coluna de detalhe do trecho atual (o percurso é mapa.js)
 *  2 · Chamados . tabela "em confirmação" + tabela de chamados
 *  3 · Registro . tabela com filtros
 *  Avisos ....... notificações compactas: novo chamado, reconexão
 * A tela 4 (Cidadão) é desenhada por cidadao.js.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;
  const $ = (id) => document.getElementById(id);
  const E = () => Pulso.estado.dados;
  const V = () => Pulso.estado.aoVivo;
  const esc = (t) => Pulso.escapar(t);
  const segundosDesde = (ms) => Math.max(0, Math.round((Date.now() - ms) / 1000));
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const abertos = () => E().chamados.filter((c) => c.status !== "resolvido");

  /** Barrinha de progresso das confirmações (ex.: 2 de 3). */
  function progresso(n) {
    let h = '<span class="progresso">';
    for (let i = 0; i < CFG.confirmacoesParaChamado; i++) h += '<i class="' + (i < n ? "on" : "") + '"></i>';
    return h + "</span>";
  }

  /* =================================================================
   * CABEÇALHO
   * A conexão é uma frase. Quando o sinal cai, ESTE é o alerta:
   * nada de faixas ou etiquetas repetindo a mesma coisa.
   * ================================================================= */
  function desenharTopo() {
    const v = V();
    const s = E().ultimoStatus;
    const aoVivo = Pulso.app && Pulso.app.modo === "aovivo";
    const buffer = s && typeof s.buffer === "number" ? s.buffer : 0;

    let classe, icone = "sinal", html;
    if (aoVivo && v.broker !== "conectado" && v.broker !== "desligado") {
      classe = "ruim"; icone = "semSinal";
      html = "<b>" + (v.broker === "conectando" ? "Conectando ao broker" : "Painel sem internet") + "</b> · tentando de novo";
    } else if (v.online === true) {
      classe = buffer > 0 ? "alerta" : "ok";
      html = "<b>Conectado</b> · " + (buffer > 0
        ? '<span class="buffer"><span class="num">' + buffer + "</span> " + (buffer === 1 ? "leitura" : "leituras") + " no buffer</span>"
        : 'sinal há <span class="num">' + segundosDesde(v.ultimoSinalEm) + "</span> s");
    } else if (v.online === false) {
      classe = "ruim"; icone = "semSinal";
      html = '<b>Sem sinal há <span class="num">' + segundosDesde(v.ultimoSinalEm) + "</span> s</b> · leituras guardadas no ônibus";
    } else {
      classe = "espera";
      html = aoVivo ? "Aguardando o ESP32" : "Simulação iniciando";
    }
    const el = $("status");
    el.className = "conexao " + classe;
    el.innerHTML = Pulso.icone(icone) + "<span>" + html + "</span>";

    let hora = s && s.hora;
    if (!hora) {
      const ult = E().feed.find((f) => f.tipo === "leitura");
      hora = ult ? ult.hora : null;
    }
    $("relogio-hora").textContent = hora || "--:--";

    const n = abertos().length;
    $("contador-chamados").textContent = n ? n : "";
  }

  /* =================================================================
   * 1 · LINHA: detalhe do trecho atual
   * Hierarquia: onde (nome) → como está (situação) → condições
   * ambientais (tabela) → o que isso significa aqui (neste trecho).
   * ================================================================= */
  const valoresMostrados = {};

  /** Anima o número de um valor antigo até o novo (0,5 s). */
  function animarNumero(el, de, para, casas) {
    if (de === null || para === null || de === para) {
      el.textContent = Pulso.formatarNumero(para, casas);
      return;
    }
    const t0 = performance.now();
    function q(agora) {
      const t = Math.min(1, (agora - t0) / 500);
      el.textContent = Pulso.formatarNumero(de + (para - de) * (1 - Math.pow(1 - t, 3)), casas);
      if (t < 1) requestAnimationFrame(q);
    }
    requestAnimationFrame(q);
  }

  const TEXTO_CURTO = { NORMAL: "normal", ATENCAO: "atenção", CRITICO: "crítico", "---": "não avaliado" };

  let trechoMontado = null;
  function desenharAgora() {
    const caixa = $("agora");
    const id = E().onibusTrecho || (E().ultimoStatus && E().ultimoStatus.trecho);
    const t = id ? Pulso.trecho(id) : null;
    const offline = V().online === false;

    if (!t) {
      trechoMontado = null;
      caixa.innerHTML = '<span class="legenda-sec">Trecho atual</span>' +
        '<h2 class="det-nome" style="color:var(--texto-3)">Aguardando o ônibus</h2>' +
        '<p class="det-sub">' + (Pulso.app && Pulso.app.modo === "aovivo"
          ? "Os dados aparecem quando o ESP32 começar a enviar." : "A simulação está começando.") + "</p>";
      return;
    }

    const s = E().ultimoStatus;
    const l = E().trechos[id].ultimaLeitura;
    // O status só vale para este trecho se foi medido nele. Logo depois que o
    // ônibus muda de trecho, o último status ainda é do anterior: nesse
    // instante mostramos a última passagem por este trecho (nunca misturar).
    const sAqui = s && (!s.trecho || s.trecho === id) ? s : null;
    const falha = sAqui && (sAqui.falha_sensor === true || sAqui.geral === "FALHA");

    if (trechoMontado !== id) {
      trechoMontado = id;
      let linhas = "";
      Pulso.CAMADAS.forEach((c) => {
        linhas += '<div class="leit" data-camada="' + c.id + '">' +
          '<span class="leit-nome">' + Pulso.icone(c.id) + esc(c.nome.replace(" · ", " ")) + "</span>" +
          '<span class="leit-valor">—</span><span class="leit-un">' + c.unidade + "</span>" +
          '<span class="leit-est"></span></div>';
      });
      caixa.innerHTML =
        '<span class="legenda-sec" id="det-legenda"></span>' +
        '<div class="bloco troca">' +
          '<h2 class="det-nome">' + esc(t.rua) + "</h2>" +
          '<p class="det-sub"></p>' +
          '<div class="det-situacao"></div>' +
          '<section class="det-leituras"><span class="legenda-sec">Condições ambientais</span>' + linhas +
            '<p class="det-nota"></p></section>' +
          '<section class="det-neste"><span class="legenda-sec">Neste trecho</span><p></p></section>' +
        "</div>";
      Object.keys(valoresMostrados).forEach((k) => delete valoresMostrados[k]);
    }

    $("det-legenda").textContent = offline ? "Última posição conhecida" : "Trecho atual";
    caixa.querySelector(".det-sub").innerHTML = '<span class="mono">' + esc(t.id) + "</span>" + esc(t.cenario) +
      (Pulso.voltaAtual ? " · volta " + Pulso.voltaAtual : "");

    // ---- Situação em uma frase ----
    let estado, origem;
    if (sAqui) {
      estado = falha ? "FALHA" : sAqui.geral;
      origem = "Estado geral agora" + (sAqui.hora ? ", medido às " + esc(sAqui.hora) : "");
    } else if (l) {
      estado = Pulso.piorEstado(l.estados);
      origem = "Na última passagem por aqui" + (l.passagem != null ? " (volta " + esc(l.passagem) + ")" : "");
    } else {
      estado = "SEM";
      origem = "Aguardando a primeira medição";
    }
    let frase;
    if (estado === "FALHA") frase = "Falha de sensor";
    else if (estado === "SEM") frase = "Sem dados ainda";
    else if (estado === "---") frase = "Não avaliado";
    else if (estado === "NORMAL") frase = "Sem problemas";
    else {
      const quais = l ? Pulso.CAMADAS.filter((c) => l.estados[c.id] === estado).map((c) => c.id) : [];
      if (quais.length === 1) frase = maiuscula(Pulso.descreverCamada(quais[0], estado));
      else if (quais.length > 1) frase = Pulso.TEXTO_ESTADO[estado] + ": " + quais.map((q) => Pulso.NOME_CURTO[q]).join(" e ");
      else frase = Pulso.TEXTO_ESTADO[estado];
    }
    const sit = caixa.querySelector(".det-situacao");
    sit.className = "det-situacao est-" + Pulso.classeEstado(estado);
    sit.innerHTML = Pulso.icone(Pulso.ICONE_ESTADO[estado] || "SEM") + "<strong>" + esc(frase) + "</strong><span>" + origem + "</span>";

    // ---- Condições ambientais (tabela) ----
    Pulso.CAMADAS.forEach((c) => {
      const el = caixa.querySelector('[data-camada="' + c.id + '"]');
      let valor = null;
      if (sAqui && sAqui[c.campo] !== undefined) valor = sAqui[c.campo];
      else if (l) valor = l[c.campo];
      valor = valor === null || valor === undefined || Number.isNaN(Number(valor)) ? null : Number(valor);

      const anterior = valoresMostrados[c.id] === undefined ? null : valoresMostrados[c.id];
      animarNumero(el.querySelector(".leit-valor"), anterior, valor, c.casas);
      valoresMostrados[c.id] = valor;

      let est, texto;
      if (valor === null && falha) { est = "FALHA"; texto = "sem leitura"; }
      else if (l) { est = l.estados[c.id]; texto = TEXTO_CURTO[est] || est; }
      else { est = "SEM"; texto = "aguardando"; }
      el.className = "leit est-" + Pulso.classeEstado(est) +
        (est === "CRITICO" || est === "ATENCAO" ? " problema" : "") + (valor === null ? " vazio" : "");
      el.querySelector(".leit-est").innerHTML = Pulso.pilula(est, texto);
    });
    caixa.querySelector(".det-nota").textContent = l
      ? "Valores ao vivo. A classificação de cada camada é a do ônibus na última passagem por este trecho."
      : "Valores ao vivo. A classificação aparece depois da primeira passagem.";

    caixa.querySelector(".det-neste p").innerHTML = textoNeste(id);
  }

  /** "Neste trecho": chamado aberto ou quanto falta para nascer um. */
  function textoNeste(id) {
    const limite = CFG.confirmacoesParaChamado;
    const frases = [];
    Object.keys(CFG.chamados).forEach((camada) => {
      const c = E().chamados.find((x) => x.trecho === id && x.camada === camada && x.status !== "resolvido");
      if (c) {
        frases.push("<b>" + esc(c.titulo) + "</b>: chamado " + '<span class="prot">' + esc(c.protocolo) + "</span> " +
          esc(Pulso.processador.TEXTO_STATUS_CHAMADO[c.status].toLowerCase()) + ".");
        return;
      }
      const n = E().confirmacoes[id][camada].passagens.length;
      if (n > 0) {
        const falta = limite - n;
        frases.push("<b>" + esc(maiuscula(Pulso.descreverCamada(camada, "CRITICO"))) + "</b> em " + n + " de " + limite +
          " passagens. " + (falta === 1 ? "Na próxima, nasce um chamado." : "Faltam " + falta + " para virar chamado.") + progresso(n));
      }
    });
    return frases.length ? frases.join("<br>") : "Nenhum problema confirmado aqui.";
  }

  /* =================================================================
   * 2 · CHAMADOS
   * ================================================================= */
  const jaAnimados = new Set();

  function desenharChamados() {
    const limite = CFG.confirmacoesParaChamado;
    const lista = E().chamados.slice().sort((a, b) => {
      const ra = a.status === "resolvido" ? 1 : 0;
      const rb = b.status === "resolvido" ? 1 : 0;
      return ra - rb || b.criadoEm - a.criadoEm;
    });
    const conta = (st) => lista.filter((c) => c.status === st).length;

    const pendentes = [];
    CFG.trechos.forEach((t) => {
      Object.keys(CFG.chamados).forEach((camada) => {
        const n = E().confirmacoes[t.id][camada].passagens.length;
        const temAberto = E().chamados.some((c) => c.trecho === t.id && c.camada === camada && c.status !== "resolvido");
        if (n > 0 && n < limite && !temAberto) pendentes.push({ t, camada, n });
      });
    });

    let html =
      '<header class="tela-cabeca"><div><h1>Chamados</h1>' +
        "<p>Abertos automaticamente quando " + limite + " passagens confirmam o mesmo problema no mesmo trecho.</p></div>" +
        '<div class="resumo"><span class="aberto"><b>' + conta("aberto") + "</b>" + (conta("aberto") === 1 ? "aberto" : "abertos") + "</span>" +
          "<span><b>" + conta("atendimento") + "</b>em atendimento</span>" +
          "<span><b>" + conta("resolvido") + "</b>" + (conta("resolvido") === 1 ? "resolvido" : "resolvidos") + "</span></div>" +
      "</header>";

    html += '<section class="bloco-conf"><h2 class="secao-tit">Em confirmação <span>problemas que ainda não somam ' + limite + " passagens</span></h2>";
    if (pendentes.length) {
      html += '<table class="tabela"><thead><tr><th style="width:120px">Trecho</th><th style="width:340px">Rua</th><th>Problema</th><th style="width:280px">Confirmações</th></tr></thead><tbody>';
      pendentes.forEach((p) => {
        html += '<tr><td class="mono">' + p.t.id + "</td><td>" + esc(p.t.rua) + "</td><td>" +
          esc(CFG.chamados[p.camada].titulo) + ' <span class="fraco">· ' + esc(Pulso.descreverCamada(p.camada, "CRITICO")) + "</span></td>" +
          '<td><span class="mono">' + p.n + " de " + limite + "</span>" + progresso(p.n) + "</td></tr>";
      });
      html += "</tbody></table>";
    } else {
      html += '<p class="vazio">Nenhum problema a caminho de virar chamado.</p>';
    }
    html += "</section>";

    html += '<section><h2 class="secao-tit">Chamados abertos e resolvidos</h2>';
    if (lista.length) {
      html += '<table class="tabela"><thead><tr><th style="width:150px">Protocolo</th><th>Problema</th><th>Trecho</th>' +
        '<th>Órgão</th><th style="width:110px">Aberto às</th><th style="width:110px">Passagens</th>' +
        '<th style="width:170px">Situação</th><th class="so-edicao" style="width:320px"></th></tr></thead><tbody>';
      lista.forEach((c) => {
        const novo = Date.now() - c.criadoEm < 4000 && !jaAnimados.has(c.id);
        if (novo) jaAnimados.add(c.id);
        let acoes = "";
        if (c.status !== "resolvido") {
          acoes = '<div class="acoes">' +
            (c.status === "aberto" ? '<button data-chamado="' + c.id + '" data-novo="atendimento">Iniciar atendimento</button>' : "") +
            '<button data-chamado="' + c.id + '" data-novo="resolvido">Marcar resolvido</button></div>';
        }
        html += '<tr class="' + c.status + (novo ? " novo" : "") + '">' +
          '<td class="mono prot-cel">' + esc(c.protocolo) + "</td>" +
          "<td>" + esc(c.titulo) + "</td>" +
          '<td><span class="mono fraco">' + esc(c.trecho) + "</span> " + esc(c.rua) + "</td>" +
          '<td class="fraco">' + esc(c.orgao) + "</td>" +
          '<td class="mono">' + esc(c.hora) + "</td>" +
          '<td class="mono">' + c.passagens.length + "</td>" +
          '<td class="st-' + c.status + '">' + Pulso.processador.TEXTO_STATUS_CHAMADO[c.status] + "</td>" +
          '<td class="so-edicao">' + acoes + "</td></tr>";
      });
      html += "</tbody></table>";
    } else {
      html += '<p class="vazio">Nenhum chamado ainda. Ninguém precisa reclamar: o ônibus confirma o problema sozinho.</p>';
    }
    html += "</section>";
    $("vista-chamados").innerHTML = html;
  }

  /* =================================================================
   * 3 · REGISTRO
   * ================================================================= */
  const FILTROS = [
    { id: "tudo", nome: "Tudo" },
    { id: "problemas", nome: "Problemas" },
    { id: "chamados", nome: "Chamados" },
    { id: "conexao", nome: "Conexão" },
  ];
  let filtro = "tudo";
  let idNovo = null;

  function categoria(item) {
    if (item.tipo === "chamado") return "chamados";
    if (item.tipo === "conexao" || item.tipo === "falha") return "conexao";
    if (item.nivel === "CRITICO" || item.nivel === "ATENCAO") return "problemas";
    return "outros";
  }

  function htmlLinha(item) {
    const nivel = item.tipo === "falha" ? "FALHA" : item.nivel;
    const classe = nivel === "CHAMADO" ? "NA" : Pulso.classeEstado(nivel);
    const evento = maiuscula(item.partes[0] || "");
    let detalhe = item.partes.slice(1).map(esc).join(" · ");
    if (item.atrasada) detalhe += '<span class="tag">recebida após reconexão</span>';
    return '<tr class="' + (item.id === idNovo ? "entrando" : "") + '">' +
      '<td class="mono">' + esc(item.hora) + "</td>" +
      "<td>" + (item.trecho ? '<span class="mono fraco">' + esc(item.trecho) + "</span> " + esc(item.rua) : '<span class="fraco">—</span>') + "</td>" +
      '<td class="' + (nivel === "CHAMADO" ? "ev-chamado" : "") + '"><i class="ev-sinal est-' + classe + '"></i>' + esc(evento) + "</td>" +
      '<td class="mono fraco">' + detalhe + "</td></tr>";
  }

  function desenharRegistro() {
    const todos = E().feed;
    const contagem = { tudo: todos.length };
    todos.forEach((i) => { const c = categoria(i); contagem[c] = (contagem[c] || 0) + 1; });
    const visiveis = todos.filter((i) => filtro === "tudo" || categoria(i) === filtro).slice(0, 30);
    const n = E().contadorLeituras;

    $("vista-registro").innerHTML =
      '<header class="tela-cabeca"><div><h1>Registro</h1>' +
        '<p>Tudo o que o ônibus informou, na ordem em que chegou · <span class="mono">' + n + "</span> " + (n === 1 ? "leitura" : "leituras") + "</p></div>" +
        '<nav class="filtros">' + FILTROS.map((f) =>
          '<button data-filtro="' + f.id + '" class="' + (f.id === filtro ? "ativo" : "") + '">' + f.nome +
          "<span>" + (contagem[f.id] || 0) + "</span></button>").join("") + "</nav></header>" +
      '<div class="registro-lista">' + (visiveis.length
        ? '<table class="tabela"><thead><tr><th style="width:120px">Hora</th><th style="width:380px">Trecho</th><th>Evento</th><th style="width:420px">Detalhe</th></tr></thead><tbody>' +
          visiveis.map(htmlLinha).join("") + "</tbody></table>"
        : '<p class="vazio">Nada por aqui ainda.</p>') + "</div>";
  }

  /* =================================================================
   * AVISOS: notificações compactas (só o que é novidade)
   *  - novo chamado: 7 s, com som
   *  - reconexão: uma notificação que vai contando as leituras
   * A falta de sinal NÃO gera aviso: ela já está no cabeçalho.
   * ================================================================= */
  function criarAviso(classe, html) {
    const el = document.createElement("div");
    el.className = "aviso " + classe;
    el.innerHTML = html;
    $("faixa").appendChild(el);
    return el;
  }
  function fecharAviso(el) {
    if (!el || !el.parentNode) return;
    el.classList.add("saindo");
    setTimeout(() => el.remove(), 300);
  }

  function avisoNovoChamado(c) {
    const el = criarAviso("", Pulso.icone("chamado") +
      "<strong>Novo chamado: " + esc(c.titulo) + "</strong>" +
      '<span><span class="mono">' + esc(c.trecho) + "</span> " + esc(c.rua) + ' · <span class="mono">' + esc(c.protocolo) +
      "</span> · " + esc(c.orgao) + "</span>");
    setTimeout(() => fecharAviso(el), 7000);
    Pulso.som.tocar("chamado");
  }

  let avisoReconexao = null, tempReconexao = null;
  function avisoDeReconexao(r) {
    const n = r.quantidade;
    const html = Pulso.icone("sinal") +
      '<strong>Sinal restabelecido: <span class="mono">' + n + "</span> " + (n === 1 ? "leitura recebida" : "leituras recebidas") + " após reconexão</strong>" +
      "<span>" + (r.ativa ? "Recebendo o que ficou guardado no ônibus…" : "Tudo o que ficou guardado no ônibus chegou.") + "</span>";
    if (!avisoReconexao || !avisoReconexao.parentNode) {
      avisoReconexao = criarAviso("azul", html);
      Pulso.som.tocar("reconexao");
    } else {
      avisoReconexao.innerHTML = html;
    }
    clearTimeout(tempReconexao);
    if (!r.ativa) {
      const el = avisoReconexao;
      tempReconexao = setTimeout(() => fecharAviso(el), 4000);
    }
  }

  /* =================================================================
   * LIGAÇÕES
   * ================================================================= */
  Pulso.paineis = {
    iniciar() {
      $("vista-chamados").addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-chamado]");
        if (b) Pulso.processador.definirStatusChamado(b.dataset.chamado, b.dataset.novo);
      });
      $("vista-registro").addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-filtro]");
        if (!b) return;
        filtro = b.dataset.filtro;
        idNovo = null;
        desenharRegistro();
      });

      const doTrecho = () => { desenharAgora(); desenharTopo(); };
      Pulso.eventos.on("status", doTrecho);
      Pulso.eventos.on("leitura", doTrecho);
      Pulso.eventos.on("onibus", desenharAgora);
      Pulso.eventos.on("conexao", doTrecho);
      Pulso.eventos.on("tique", desenharTopo);
      Pulso.eventos.on("confirmacoes", () => { desenharChamados(); desenharAgora(); });
      Pulso.eventos.on("chamado:novo", (c) => { desenharChamados(); doTrecho(); avisoNovoChamado(c); });
      Pulso.eventos.on("chamado:atualizado", () => { desenharChamados(); doTrecho(); });
      Pulso.eventos.on("feed", (item) => { idNovo = item.id; desenharRegistro(); });
      Pulso.eventos.on("reconexao", avisoDeReconexao);
      Pulso.eventos.on("zerar", () => this.redesenharTudo(true));
      this.redesenharTudo();
    },
    /** Redesenha tudo (abrir a página, trocar de modo, zerar). */
    redesenharTudo(limpar) {
      if (limpar) $("faixa").innerHTML = "";
      trechoMontado = null;
      idNovo = null;
      desenharTopo();
      desenharAgora();
      desenharChamados();
      desenharRegistro();
    },
  };
})();
