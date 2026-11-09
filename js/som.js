/* =====================================================================
 * SOM CURTO
 * ---------------------------------------------------------------------
 * Gerado pelo próprio navegador (Web Audio), sem arquivos de áudio.
 * Navegadores só liberam som depois de uma tecla ou clique na página:
 * por isso, aperte qualquer atalho antes de começar a gravar.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  let contexto = null;
  let ligado = true;
  try {
    ligado = localStorage.getItem("pulso:som") !== "desligado";
  } catch (e) { /* sem armazenamento: som ligado */ }

  /** Cria/acorda o áudio. Chamado a cada tecla ou clique. */
  function destravar() {
    try {
      if (!contexto) contexto = new (window.AudioContext || window.webkitAudioContext)();
      if (contexto.state === "suspended") contexto.resume();
    } catch (e) { /* navegador sem Web Audio */ }
  }
  window.addEventListener("keydown", destravar);
  window.addEventListener("pointerdown", destravar);

  /** Uma nota com início e fim suaves (sem estalo). */
  function nota(freq, inicio, duracao, volume) {
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = contexto.currentTime + inicio;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
    osc.connect(ganho).connect(contexto.destination);
    osc.start(t);
    osc.stop(t + duracao + 0.05);
  }

  Pulso.som = {
    /** tipo: "chamado" (duas notas subindo) ou "reconexao" (nota suave). */
    tocar(tipo) {
      if (!ligado || !contexto || contexto.state !== "running") return;
      if (tipo === "chamado") {
        nota(784, 0, 0.35, 0.22);   // sol
        nota(1175, 0.14, 0.5, 0.2); // ré (uma quinta acima)
      } else {
        nota(659, 0, 0.4, 0.12);
      }
    },
    alternar() {
      ligado = !ligado;
      try { localStorage.setItem("pulso:som", ligado ? "ligado" : "desligado"); } catch (e) { /* ok */ }
      return ligado;
    },
    get ligado() { return ligado; },
    get liberado() { return !!contexto && contexto.state === "running"; },
  };
})();
