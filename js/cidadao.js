/* =====================================================================
 * VISÃO DO CIDADÃO (moldura de celular)
 * ---------------------------------------------------------------------
 * Mostra a mesma linha em linguagem simples, como um app de transporte
 * mostraria para quem está no ponto de ônibus. Usa os mesmos dados do
 * painel (nada é recalculado). As dicas ficam em config.js.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;
  const E = () => Pulso.estado.dados;
  const esc = (t) => Pulso.escapar(t);

  // Frases curtas para cada camada, por estado.
  const FRASES = {
    CRITICO: { luz: "Escuro · poste apagado", calor: "Muito quente", pavimento: "Buraco na via", ar: "Ar poluído" },
    ATENCAO: { luz: "Pouca luz", calor: "Quente", pavimento: "Via irregular", ar: "Ar carregado" },
  };

  // Ordem de prioridade das dicas (o que mais importa para quem está a pé).
  const PRIORIDADE = ["luz", "pavimento", "ar", "calor"];

  /** Frase simples para um trecho. */
  function fraseDoTrecho(info) {
    const l = info.ultimaLeitura;
    if (!l) return "Sem informação ainda";
    const pior = info.pior;
    if (pior === "CRITICO" || pior === "ATENCAO") {
      const camadas = PRIORIDADE.filter((c) => l.estados[c] === pior);
      return camadas.map((c) => FRASES[pior][c]).join(" · ");
    }
    if (pior === "NORMAL") return "Tranquilo";
    return "Sem avaliação agora";
  }

  /** Escolhe a dica: o problema crítico mais próximo, a partir de onde o ônibus está. */
  function escolherDica() {
    const ids = CFG.trechos.map((t) => t.id);
    const inicio = Math.max(0, ids.indexOf(E().onibusTrecho));
    for (let k = 0; k < ids.length; k++) {
      const id = ids[(inicio + k) % ids.length];
      const l = E().trechos[id].ultimaLeitura;
      if (!l) continue;
      const camada = PRIORIDADE.find((c) => l.estados[c] === "CRITICO");
      if (camada) {
        const t = Pulso.trecho(id);
        const texto = (CFG.dicasCidadao[camada] || "Atenção na {rua}.")
          .replace(/\{rua\}/g, t.rua).replace(/\{paralela\}/g, t.paralela || "rua paralela");
        const chamado = E().chamados.find((c) => c.trecho === id && c.camada === camada && c.status !== "resolvido");
        return { id, camada, texto, chamado };
      }
    }
    return null;
  }

  let ultimaDica = "";

  function desenhar() {
    const tela = document.getElementById("celular");
    const s = E().ultimoStatus;
    const hora = (s && s.hora) || "--:--";
    const aqui = E().onibusTrecho;
    const tAqui = aqui ? Pulso.trecho(aqui) : null;
    const offline = Pulso.estado.aoVivo.online === false;

    // Cartão "seu ônibus"
    const onibus =
      '<div class="cel-onibus' + (offline || !tAqui ? " sem" : "") + '"><i class="bola"></i><span>' +
      (tAqui ? (offline ? "Última posição: " : "Seu ônibus está na ") + "<b>" + esc(tAqui.rua) + "</b>" : "Aguardando o ônibus") +
      "</span></div>";

    // Dica
    const dica = escolherDica();
    let dicaHtml;
    if (dica) {
      dicaHtml =
        '<div class="cel-dica"><div class="cab">' + Pulso.icone(dica.camada) + "Dica para agora</div>" +
        "<p>" + esc(dica.texto) + "</p>" +
        (dica.chamado
          ? '<div class="aviso-prefeitura">' + Pulso.icone("check") + "Subprefeitura já avisada · " + esc(dica.chamado.protocolo) + "</div>"
          : "") +
        "</div>";
    } else {
      dicaHtml =
        '<div class="cel-dica tranquilo"><div class="cab">' + Pulso.icone("NORMAL") + "Tudo certo</div>" +
        "<p>" + (E().contadorLeituras ? "Nenhum problema na linha agora. Boa viagem!" : "Assim que o ônibus passar, você vê aqui como está cada rua.") + "</p></div>";
    }
    // Só anima a dica quando o texto muda de verdade.
    const chaveDica = dica ? dica.texto + (dica.chamado ? dica.chamado.id : "") : "ok";
    const mudou = chaveDica !== ultimaDica;
    if (mudou) {
      dicaHtml = dicaHtml.replace('class="cel-dica', 'class="troca cel-dica');
      ultimaDica = chaveDica;
    }
    desenharTexto(dica, mudou);

    // Lista de trechos
    let lista = '<ul class="cel-lista">';
    CFG.trechos.forEach((t) => {
      const info = E().trechos[t.id];
      const pior = info.pior || "SEM";
      lista +=
        '<li class="cel-trecho cc-' + Pulso.classeEstado(pior) + (aqui === t.id ? " aqui" : "") + '">' +
        '<span class="bolinha">' + Pulso.icone(Pulso.ICONE_ESTADO[pior] || "SEM") + "</span>" +
        "<div><b>" + esc(t.rua) + (aqui === t.id ? '<span class="voce">ônibus aqui</span>' : "") + "</b>" +
        "<span>" + esc(fraseDoTrecho(info)) + "</span></div></li>";
    });
    lista += "</ul>";

    const chamadosAbertos = E().chamados.filter((c) => c.status !== "resolvido").length;
    const resolvidos = E().chamados.filter((c) => c.status === "resolvido").length;
    let rodape = "Avisos automáticos para a subprefeitura";
    if (chamadosAbertos || resolvidos) {
      rodape = chamadosAbertos + (chamadosAbertos === 1 ? " problema avisado" : " problemas avisados") +
        (resolvidos ? " · " + resolvidos + (resolvidos === 1 ? " resolvido" : " resolvidos") : "") + " à subprefeitura";
    }

    tela.innerHTML =
      '<div class="cel-barra"><span>' + esc(hora) + '</span><span class="ilha"></span><span>' +
        Pulso.icone(offline ? "semSinal" : "sinal") + "</span></div>" +
      '<div class="cel-topo"><b>' + Pulso.icone("pulso") + "Pulso</b><span>LINHA " + esc(CFG.linha.codigo) + "</span></div>" +
      onibus + dicaHtml +
      '<div class="cel-titulo">Como está cada rua</div>' + lista +
      '<div class="cel-rodape">' + Pulso.icone("escudo") + esc(rodape) + "</div>";
  }

  /**
   * Texto ao lado do celular: a dica atual em tamanho grande (legível no
   * vídeo) e de onde ela veio, para mostrar que é o mesmo dado do painel.
   */
  function desenharTexto(dica, mudou) {
    let citacao;
    if (dica) {
      const t = Pulso.trecho(dica.id);
      citacao =
        '<blockquote class="cid-citacao' + (mudou ? " troca" : "") + '"><span class="legenda-sec">Dica exibida agora no app</span><q>' + esc(dica.texto) + "</q>" +
        '<p class="cid-origem">Gerada a partir de <span class="mono">' + esc(dica.id) + "</span> " + esc(t.rua) + " · " +
          esc(Pulso.descreverCamada(dica.camada, "CRITICO")) + " na última passagem" +
          (dica.chamado ? ' · <span class="ok">chamado ' + esc(dica.chamado.protocolo) + " já enviado</span>" : "") +
        "</p></blockquote>";
    } else {
      citacao =
        '<blockquote class="cid-citacao tranquilo' + (mudou ? " troca" : "") + '"><span class="legenda-sec">Dica exibida agora no app</span><q>' +
        (E().contadorLeituras ? "Nenhum problema na linha agora. Boa viagem!" : "Assim que o ônibus passar, você vê aqui como está cada rua.") +
        "</q></blockquote>";
    }
    document.getElementById("cid-texto").innerHTML =
      '<span class="legenda-sec">Visão do cidadão</span>' +
      "<h1>O mesmo dado, em linguagem simples, para quem espera no ponto.</h1>" +
      "<p>O Pulso pega o problema mais próximo do ônibus e transforma em uma dica prática: sem gráficos, sem siglas, sem precisar entender de sensores.</p>" +
      citacao;
  }

  Pulso.cidadao = {
    iniciar() {
      ["leitura", "onibus", "chamado:novo", "chamado:atualizado", "conexao", "zerar"].forEach((ev) =>
        Pulso.eventos.on(ev, desenhar)
      );
      // O status só muda a hora: redesenho leve (o HTML é pequeno).
      Pulso.eventos.on("status", desenhar);
      desenhar();
    },
    redesenhar: desenhar,
  };
})();
