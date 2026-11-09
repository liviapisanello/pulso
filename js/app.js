/* =====================================================================
 * APLICATIVO: modos, atalhos e inicialização
 * ---------------------------------------------------------------------
 * Modos:
 *   aovivo -> dados reais do ESP32 via MQTT (estado salvo no navegador)
 *   demo   -> roteiro simulado (sempre recomeça do zero)
 *   gravação -> esconde botões e cursor (vale para os dois modos)
 *
 * Telas (abas, teclas 1 a 4): linha, chamados, registro, cidadao.
 *
 * Endereço com parâmetros (útil para deixar a aba pronta):
 *   index.html?vista=chamados  abre direto numa tela
 *   index.html?modo=aovivo     abre direto no modo ao vivo
 *   index.html?modo=demo       abre direto na demonstração
 *   index.html?gravacao=1      já abre no modo gravação
 *   index.html?velocidade=2    demonstração 2x mais rápida
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  const CFG = window.PULSO_CONFIG;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  // O simulador entrega as mensagens ao processador como se viessem do
  // MQTT: transformamos em texto JSON e lemos de volta, igual ao real.
  const simulador = Pulso.criarSimulador(CFG, (tipo, objeto) => {
    const msg = Pulso.processador.lerJSON(JSON.stringify(objeto));
    if (tipo === "leituras") Pulso.processador.leitura(msg);
    else Pulso.processador.status(msg);
  });

  const VISTAS = ["linha", "chamados", "registro", "cidadao"];

  const app = {
    modo: null,
    gravando: false,
    vista: null,

    /** Troca de tela (aba). */
    definirVista(vista) {
      if (!VISTAS.includes(vista) || vista === this.vista) return;
      this.vista = vista;
      VISTAS.forEach((v) => $("vista-" + v).classList.toggle("ativa", v === vista));
      document.querySelectorAll(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.vista === vista));
    },

    /** Troca entre "demo" e "aovivo". */
    definirModo(modo) {
      if (modo === this.modo) return;
      // 1. Desliga a fonte de dados anterior.
      simulador.parar();
      Pulso.conexao.desligar();

      // 2. Carrega o estado do modo (ao vivo = salvo no navegador).
      this.modo = modo;
      Pulso.estado.usarPersistencia(modo === "aovivo");
      try { localStorage.setItem("pulso:modo", modo); } catch (e) { /* ok */ }

      // 3. Redesenha a tela com o estado novo.
      redesenharTudo();

      // 4. Liga a nova fonte de dados.
      if (modo === "demo") {
        simulador.reiniciar();
        simulador.iniciar();
      } else {
        Pulso.conexao.ligar();
      }
      atualizarInterface();
      avisar(modo === "demo" ? "Modo demonstração" : "Modo ao vivo · conectando ao broker");
    },

    alternarGravacao() {
      this.gravando = !this.gravando;
      document.body.classList.toggle("gravando", this.gravando);
      $("ajuda").classList.add("oculto");
      fecharMenu();
      atualizarInterface();
      if (!this.gravando) avisar("Modo gravação desligado");
    },

    /** Apaga chamados, histórico e confirmações. No demo, recomeça o roteiro. */
    zerar() {
      Pulso.estado.zerar();
      if (this.modo === "demo") simulador.reiniciar();
      atualizarInterface();
      avisar("Tudo zerado");
    },
  };
  Pulso.app = app;

  function redesenharTudo() {
    Pulso.mapa.redesenharTudo();
    Pulso.paineis.redesenharTudo(true);
    Pulso.cidadao.redesenhar();
  }

  /** Selo do modo + botões ativos. */
  function atualizarInterface() {
    document.body.classList.toggle("modo-demo", app.modo === "demo");
    document.body.classList.toggle("modo-aovivo", app.modo === "aovivo");
    const selo = $("selo-modo");
    // Modo em texto simples (sem selo, sem bolinha piscando)
    if (app.modo === "aovivo") {
      selo.className = "modo aovivo";
      selo.textContent = "Ao vivo";
    } else {
      selo.className = "modo";
      selo.textContent = simulador.pausado ? "Demonstração pausada" : "Demonstração";
    }
    // Marcações no menu "⋯"
    const marcar = (acao, sim) => document.querySelector('[data-acao="' + acao + '"]').classList.toggle("marcado", sim);
    marcar("aovivo", app.modo === "aovivo");
    marcar("demo", app.modo === "demo");
    marcar("gravacao", app.gravando);
  }

  /* ---------------- Menu "⋯" ---------------- */
  function abrirMenu() {
    $("menu-pop").classList.remove("oculto");
    $("menu-botao").setAttribute("aria-expanded", "true");
  }
  function fecharMenu() {
    $("menu-pop").classList.add("oculto");
    $("menu-botao").setAttribute("aria-expanded", "false");
  }
  function acaoDoMenu(acao) {
    fecharMenu();
    if (acao === "aovivo" || acao === "demo") app.definirModo(acao);
    else if (acao === "gravacao") app.alternarGravacao();
    else if (acao === "zerar") app.zerar();
    else if (acao === "ajuda") $("ajuda").classList.remove("oculto");
  }

  /* ---------------- Mensagem rápida de controle ---------------- */
  let tempAviso = null;
  function avisar(texto) {
    const el = $("dica-controle");
    el.textContent = texto;
    el.classList.add("visivel");
    clearTimeout(tempAviso);
    tempAviso = setTimeout(() => el.classList.remove("visivel"), 2200);
  }

  /* ---------------- Palco 1920x1080 ajustado à janela ---------------- */
  function ajustarPalco() {
    const escala = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const x = (window.innerWidth - 1920 * escala) / 2;
    const y = (window.innerHeight - 1080 * escala) / 2;
    $("palco").style.transform = "translate(" + x + "px," + y + "px) scale(" + escala + ")";
  }

  /* ---------------- Atalhos de teclado ---------------- */
  let zPressionadoEm = 0;
  let velocidade = Number(params.get("velocidade")) || 1;

  function aoTeclar(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return; // não atrapalha Ctrl+R etc.
    const tecla = ev.key.toLowerCase();

    switch (tecla) {
      case "1": case "2": case "3": case "4": app.definirVista(VISTAS[Number(tecla) - 1]); break;
      case "l": app.definirModo("aovivo"); break;
      case "d": app.definirModo("demo"); break;
      case "g": app.alternarGravacao(); break;
      case "z":
        // Duas vezes em até 2 s para zerar (evita acidente no meio da gravação).
        if (Date.now() - zPressionadoEm < 2000) {
          zPressionadoEm = 0;
          app.zerar();
        } else {
          zPressionadoEm = Date.now();
          avisar("Aperte Z de novo para zerar");
        }
        break;
      case "a": Pulso.processador.avancarChamado(); break;
      case " ":
        ev.preventDefault();
        if (app.modo === "demo") {
          const pausado = simulador.alternarPausa();
          atualizarInterface();
          avisar(pausado ? "Demonstração pausada" : "Demonstração continuando");
        }
        break;
      case "+": case "=":
        velocidade = Math.min(8, velocidade * 2);
        simulador.definirVelocidade(velocidade);
        avisar("Velocidade da demonstração: " + velocidade + "x");
        break;
      case "-": case "_":
        velocidade = Math.max(0.25, velocidade / 2);
        simulador.definirVelocidade(velocidade);
        avisar("Velocidade da demonstração: " + velocidade + "x");
        break;
      case "s":
        avisar(Pulso.som.alternar() ? "Som ligado" : "Som desligado");
        break;
      case "f":
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen();
        break;
      case "h": case "?":
        $("ajuda").classList.toggle("oculto");
        break;
      case "escape":
        $("ajuda").classList.add("oculto");
        fecharMenu();
        break;
      default:
        return;
    }
  }

  /* ---------------- Início ---------------- */
  function iniciar() {
    // Textos e ícones fixos do topo
    document.querySelectorAll("[data-icone]").forEach((el) => (el.innerHTML = Pulso.icone(el.dataset.icone)));
    $("marca-linha").textContent = CFG.linha.codigo;

    ajustarPalco();
    window.addEventListener("resize", ajustarPalco);

    Pulso.mapa.iniciar();
    Pulso.paineis.iniciar();
    Pulso.cidadao.iniciar();

    // Abas
    document.querySelectorAll(".aba").forEach((b) => (b.onclick = () => app.definirVista(b.dataset.vista)));
    // Menu "⋯"
    $("menu-botao").onclick = (ev) => {
      ev.stopPropagation();
      $("menu-pop").classList.contains("oculto") ? abrirMenu() : fecharMenu();
    };
    $("menu-pop").onclick = (ev) => {
      const b = ev.target.closest("[data-acao]");
      if (b) acaoDoMenu(b.dataset.acao);
    };
    document.addEventListener("click", (ev) => { if (!ev.target.closest(".menu")) fecharMenu(); });
    $("ajuda").onclick = (ev) => { if (ev.target.id === "ajuda") $("ajuda").classList.add("oculto"); };
    window.addEventListener("keydown", aoTeclar);

    // Modo inicial: endereço > última escolha > demonstração
    let modo = params.get("modo");
    if (modo === "ao-vivo" || modo === "live") modo = "aovivo";
    if (modo !== "demo" && modo !== "aovivo") {
      try { modo = localStorage.getItem("pulso:modo"); } catch (e) { modo = null; }
    }
    if (modo !== "demo" && modo !== "aovivo") modo = "demo";

    simulador.definirVelocidade(velocidade);
    app.definirVista(VISTAS.includes(params.get("vista")) ? params.get("vista") : "linha");
    app.definirModo(modo);
    if (params.get("gravacao") === "1") app.alternarGravacao();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
