/* =====================================================================
 * ÍCONES
 * Ícones SVG simples (traço), desenhados para este projeto.
 * Uso: Pulso.icone("luz") devolve o HTML do <svg>.
 * ===================================================================== */
window.Pulso = window.Pulso || {};

(function () {
  // Cada ícone é só o "miolo" do SVG (viewBox 0 0 24 24).
  const DESENHOS = {
    // --- camadas medidas ---
    calor: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
    luz: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
    pavimento: '<path d="M3 17h4c1.5 0 2-1 3-3s2-3 2-3 1 1 2 3 1.5 3 3 3h4"/><path d="M3 21h18"/><path d="M12 4v3"/>',
    ar: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',

    // --- estados ---
    NORMAL: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.8"/>',
    ATENCAO: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
    CRITICO: '<path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2Z"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>',
    SEM: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    FALHA: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9Z"/>',

    // --- interface ---
    onibus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16"/><path d="M8 18v2.5"/><path d="M16 18v2.5"/><circle cx="8" cy="14.5" r=".6" fill="currentColor"/><circle cx="16" cy="14.5" r=".6" fill="currentColor"/><path d="M9 6.5h6"/>',
    sinal: '<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
    semSinal: '<path d="m2 2 20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.6a10 10 0 0 1 5.2-2.7"/><path d="M19 12.6a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.7"/><path d="M10.7 5a15 15 0 0 1 11.3 3.8"/><path d="M12 20h.01"/>',
    caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    chamado: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    ferramenta: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9Z"/>',
    pulso: '<path d="M2 12h4l2.5-6 4 13 3-9 1.5 2H22"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  };

  /**
   * Devolve o HTML de um ícone.
   * @param {string} nome   chave do ícone em DESENHOS
   * @param {string} classe classe CSS extra (opcional)
   */
  Pulso.icone = function (nome, classe) {
    const miolo = DESENHOS[nome] || DESENHOS.SEM;
    return (
      '<svg class="ico ' + (classe || "") + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      miolo + "</svg>"
    );
  };
})();
