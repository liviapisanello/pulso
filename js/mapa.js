/* =====================================================================
 * PERCURSO (pista em anel igual à maquete)
 * ---------------------------------------------------------------------
 * Diagrama de linha: um leito escuro e, por cima, o traço de cada trecho.
 * O estado da última passagem muda a COR e a ESPESSURA do traço
 * (fino = normal, médio = atenção, grosso = crítico, pontilhado = sem
 * dados), então dá para ler mesmo sem distinguir cores.
 * Fronteiras entre trechos são cortes no leito. O ônibus anda no
 * sentido horário:
 *
 *            T01 ─────┃───── T02
 *          ╱                    ╲
 *       T06          Volta 3       T03
 *          ╲                    ╱
 *            T05 ─────┃───── T04
 *
 * Rótulos: nome do trecho numa linha; uma segunda linha só aparece
 * quando há problema (o quê, confirmações ou protocolo do chamado).
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;

  /* ---------------- Geometria (pixels da área do mapa) ---------------- */
  const LARG = 1264, ALT = 820;
  const CX = 632, CY = 430;   // centro da pista
  const R = 200;              // raio das curvas
  const L = 420;              // comprimento de cada reta
  const MEIA = 15;            // metade da largura do leito
  const XE = CX - L / 2;      // centro da curva esquerda
  const XD = CX + L / 2;      // centro da curva direita
  const CURVA = Math.PI * R;
  const PERIMETRO = 2 * L + 2 * CURVA;
  const FOLGA = 20;           // distância entre o leito e o rótulo
  const LARG_ROT = 260, LARG_LAT = 180;

  /** Ponto da pista a uma distância "s" do início (canto de cima à esquerda), sentido horário. */
  function pontoEm(s) {
    s = ((s % PERIMETRO) + PERIMETRO) % PERIMETRO;
    if (s < L) return { x: XE + s, y: CY - R };                    // reta de cima
    s -= L;
    if (s < CURVA) {                                               // curva direita
      const a = -Math.PI / 2 + s / R;
      return { x: XD + R * Math.cos(a), y: CY + R * Math.sin(a) };
    }
    s -= CURVA;
    if (s < L) return { x: XD - s, y: CY + R };                    // reta de baixo
    s -= L;
    const a = Math.PI / 2 + s / R;                                 // curva esquerda
    return { x: XE + R * Math.cos(a), y: CY + R * Math.sin(a) };
  }

  /* Início e fim de cada trecho. Com 6: metades da reta de cima, curva
   * direita, metades da reta de baixo, curva esquerda. Senão, partes iguais. */
  function limitesDosTrechos() {
    const n = CFG.trechos.length;
    if (n === 6) {
      const m = [0, L / 2, L, L + CURVA, L + CURVA + L / 2, 2 * L + CURVA, PERIMETRO];
      return CFG.trechos.map((t, i) => ({ id: t.id, ini: m[i], fim: m[i + 1] }));
    }
    return CFG.trechos.map((t, i) => ({ id: t.id, ini: (PERIMETRO * i) / n, fim: (PERIMETRO * (i + 1)) / n }));
  }
  const LIMITES = limitesDosTrechos();
  const meioDoTrecho = (id) => {
    const l = LIMITES.find((x) => x.id === id);
    return l ? (l.ini + l.fim) / 2 : 0;
  };

  /** Caminho SVG entre duas distâncias (linha com muitos pontos). */
  function caminho(ini, fim) {
    let d = "";
    for (let s = ini; s < fim; s += 4) {
      const p = pontoEm(s);
      d += (d ? " L " : "M ") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    }
    const p = pontoEm(fim);
    return d + " L " + p.x.toFixed(1) + " " + p.y.toFixed(1);
  }

  /** Posição de cada rótulo (fora do anel) e da sua linha-guia. */
  function posicaoDoRotulo(id) {
    const p = pontoEm(meioDoTrecho(id));
    if (Math.abs(p.y - (CY - R)) < 1 || Math.abs(p.y - (CY + R)) < 1) {
      // Nas retas há dois rótulos lado a lado: cada um vai um pouco para fora.
      const x = p.x + (p.x < CX ? -44 : 44);
      if (p.y < CY) {
        const y = CY - R - MEIA;
        return { lado: "cima", estilo: "left:" + (x - LARG_ROT / 2) + "px;top:" + (y - FOLGA) + "px;transform:translateY(-100%)",
          guia: [x, y - FOLGA + 6, x, y] };
      }
      const y = CY + R + MEIA;
      return { lado: "baixo", estilo: "left:" + (x - LARG_ROT / 2) + "px;top:" + (y + FOLGA) + "px",
        guia: [x, y, x, y + FOLGA - 6] };
    }
    if (p.x > CX) {
      const x = XD + R + MEIA;
      return { lado: "dir", estilo: "left:" + (x + FOLGA) + "px;top:" + CY + "px;transform:translateY(-50%)",
        guia: [x, CY, x + FOLGA - 6, CY] };
    }
    const x = XE - R - MEIA;
    return { lado: "esq", estilo: "left:" + (x - FOLGA - LARG_LAT) + "px;top:" + CY + "px;transform:translateY(-50%)",
      guia: [x - FOLGA + 6, CY, x, CY] };
  }

  /* ---------------- Montagem ---------------- */
  let elOnibus, sOnibus = null, animacao = null;
  const els = {};

  function montar() {
    const area = document.getElementById("mapa");
    const completo = caminho(0, PERIMETRO) + " Z";

    let svg = '<svg class="pista" viewBox="0 0 ' + LARG + " " + ALT + '" width="' + LARG + '" height="' + ALT +
      '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<path class="leito" d="' + completo + '"/>';
    LIMITES.forEach((l) => {
      const d = caminho(l.ini, l.fim);
      svg += '<path class="realce" data-realce="' + l.id + '" d="' + d + '"/>';
      svg += '<path class="segmento est-SEM" data-seg="' + l.id + '" d="' + d + '"/>';
    });
    // Cortes nas fronteiras entre trechos (todas ficam nas retas: corte vertical)
    LIMITES.forEach((l) => {
      const p = pontoEm(l.ini);
      svg += '<line class="corte" x1="' + p.x.toFixed(1) + '" y1="' + (p.y - MEIA - 2) + '" x2="' + p.x.toFixed(1) + '" y2="' + (p.y + MEIA + 2) + '"/>';
    });
    CFG.trechos.forEach((t) => {
      const g = posicaoDoRotulo(t.id).guia;
      svg += '<line class="guia" x1="' + g[0] + '" y1="' + g[1] + '" x2="' + g[2] + '" y2="' + g[3] + '"/>';
    });
    svg += "</svg>";

    let html = svg;
    CFG.trechos.forEach((t) => {
      const pos = posicaoDoRotulo(t.id);
      html += '<div class="rot ' + pos.lado + ' est-SEM" data-rot="' + t.id + '" style="' + pos.estilo + '"></div>';
    });
    html += '<div class="anel-centro" id="anel-centro"></div>';
    html += '<div class="onibus oculto" id="onibus"><div class="onibus-corpo">' + Pulso.icone("onibus") + "</div></div>";
    area.innerHTML = html;

    CFG.trechos.forEach((t) => {
      els[t.id] = {
        seg: area.querySelector('[data-seg="' + t.id + '"]'),
        realce: area.querySelector('[data-realce="' + t.id + '"]'),
        rot: area.querySelector('[data-rot="' + t.id + '"]'),
      };
    });
    elOnibus = document.getElementById("onibus");

    document.getElementById("percurso-info").textContent =
      "Linha " + CFG.linha.codigo + " · " + CFG.trechos.length + " trechos · sentido horário";

    document.getElementById("legenda").innerHTML =
      "<span><i></i>Normal</span>" +
      '<span><i class="atencao"></i>Atenção</span>' +
      '<span><i class="critico"></i>Crítico</span>' +
      '<span><i class="sem"></i>Sem dados</span>' +
      '<span><i class="bus"></i>Ônibus</span>' +
      '<span><span class="mono">2/3</span>passagens que confirmaram o problema</span>';
  }

  /* ---------------- Desenho ---------------- */
  function definirEstado(el, estado) {
    Array.from(el.classList).filter((c) => c.startsWith("est-")).forEach((c) => el.classList.remove(c));
    el.classList.add("est-" + Pulso.classeEstado(estado));
  }

  const nomeDaCamada = (c) => c.nome.split(" ·")[0];

  function desenharTrechos() {
    const E = Pulso.estado.dados;
    CFG.trechos.forEach((t) => {
      const info = E.trechos[t.id];
      const pior = info.pior || "SEM";
      const el = els[t.id];
      const atual = E.onibusTrecho === t.id;
      definirEstado(el.seg, pior);
      definirEstado(el.rot, pior);
      el.rot.classList.toggle("atual", atual);
      el.realce.classList.toggle("ativo", atual);

      // Segunda linha: só quando há problema.
      let sit = "";
      const est = info.ultimaLeitura ? info.ultimaLeitura.estados : {};
      if (pior === "CRITICO" || pior === "ATENCAO") {
        const quais = Pulso.CAMADAS.filter((c) => est[c.id] === pior).map(nomeDaCamada).join(", ");
        // Chamado aberto neste trecho? Mostra o protocolo; senão, as confirmações.
        const chamado = E.chamados.find((c) => c.trecho === t.id && c.status !== "resolvido");
        const maior = Math.max(0, ...Object.values(E.confirmacoes[t.id]).map((c) => c.passagens.length));
        let extra = "";
        if (chamado) extra = '<span class="prot">' + Pulso.escapar(chamado.protocolo) + "</span>";
        else if (maior > 0) extra = '<span class="conta">' + maior + "/" + CFG.confirmacoesParaChamado + "</span>";
        sit = '<div class="rot-sit">' + Pulso.icone(Pulso.ICONE_ESTADO[pior]) + Pulso.escapar(quais) + extra + "</div>";
      }

      el.rot.innerHTML =
        '<div class="rot-nome"><span class="mono">' + t.id + "</span>" + Pulso.escapar(t.rua) + "</div>" + sit;
    });
    desenharVolta();
  }

  /** Volta atual, a partir do campo "passagem" das leituras (só exibe; não recalcula estados). */
  function desenharVolta() {
    const E = Pulso.estado.dados;
    let maior = 0, ultima = null;
    Object.values(E.trechos).forEach((t) => {
      const l = t.ultimaLeitura;
      if (!l) return;
      if (typeof l.passagem === "number" && l.passagem > maior) maior = l.passagem;
      if (!l.enviado_offline && (!ultima || l.recebidaEm > ultima.recebidaEm)) ultima = l;
    });
    let volta = maior;
    const ids = CFG.trechos.map((t) => t.id);
    // Terminou o último trecho da volta? Então o ônibus já está na próxima.
    if (ultima && ultima.trecho === ids[ids.length - 1] && E.onibusTrecho === ids[0] && ultima.passagem === maior) volta++;
    Pulso.voltaAtual = volta;
    document.getElementById("anel-centro").innerHTML = volta
      ? '<strong>Volta <span class="mono">' + volta + "</span></strong><span>passagem atual da maquete</span>"
      : "<span>Aguardando a primeira volta</span>";
  }

  /* ---------------- Ônibus ---------------- */
  function posicionarOnibus(s) {
    const p = pontoEm(s);
    elOnibus.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
  }
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** Leva o ônibus até o meio do trecho, sempre andando para a frente. */
  function moverOnibus(para, animar) {
    const alvo = meioDoTrecho(para);
    elOnibus.classList.remove("oculto");
    cancelAnimationFrame(animacao);
    if (sOnibus === null || !animar) {
      sOnibus = alvo;
      posicionarOnibus(alvo);
      return;
    }
    const inicio = sOnibus;
    const distancia = (alvo - inicio + PERIMETRO) % PERIMETRO;
    if (distancia < 1) return;
    const duracao = Math.min(3000, 1000 + (distancia / PERIMETRO) * 2400);
    const t0 = performance.now();
    function quadro(agora) {
      const t = Math.min(1, (agora - t0) / duracao);
      sOnibus = (inicio + distancia * suave(t)) % PERIMETRO;
      posicionarOnibus(sOnibus);
      if (t < 1) animacao = requestAnimationFrame(quadro);
    }
    animacao = requestAnimationFrame(quadro);
  }

  function atualizarSinal() {
    elOnibus.classList.toggle("sem-sinal", Pulso.estado.aoVivo.online === false);
  }

  /* ---------------- Ligação com os eventos ---------------- */
  Pulso.mapa = {
    iniciar() {
      montar();
      this.redesenharTudo();
      Pulso.eventos.on("leitura", desenharTrechos);
      Pulso.eventos.on("confirmacoes", desenharTrechos);
      Pulso.eventos.on("chamado:novo", desenharTrechos);
      Pulso.eventos.on("chamado:atualizado", desenharTrechos);
      Pulso.eventos.on("onibus", (m) => { moverOnibus(m.para, true); desenharTrechos(); });
      Pulso.eventos.on("conexao", atualizarSinal);
      Pulso.eventos.on("zerar", () => this.redesenharTudo());
    },
    /** Redesenha do zero (abrir a página, trocar de modo, zerar). */
    redesenharTudo() {
      cancelAnimationFrame(animacao);
      sOnibus = null;
      const id = Pulso.estado.dados.onibusTrecho;
      if (id) moverOnibus(id, false);
      else elOnibus.classList.add("oculto");
      desenharTrechos();
      atualizarSinal();
    },
  };
})();
