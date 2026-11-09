/* =====================================================================
 * PULSO · ARQUIVO DE CONFIGURAÇÃO
 * ---------------------------------------------------------------------
 * Este é o único arquivo que a equipe precisa editar no dia a dia:
 * nomes das ruas, tópicos MQTT, regras de chamado e o roteiro do
 * modo demonstração. Depois de salvar, é só recarregar a página.
 * ===================================================================== */
window.PULSO_CONFIG = {

  /* Nome que aparece no topo do painel e no celular do cidadão. */
  linha: {
    nome: "Linha Pulso · Maquete",
    codigo: "875P",
  },

  /* ---------------------------------------------------------------
   * TRECHOS DA PISTA (sempre nesta ordem, igual à maquete)
   *   id        -> o mesmo código que o ESP32 envia ("T01"...)
   *   rua       -> nome da rua exibido no painel e no celular
   *   paralela  -> rua alternativa citada na dica do cidadão
   *   cenario   -> o que existe na maquete naquele trecho
   * --------------------------------------------------------------- */
  trechos: [
    // Mesmos nomes do firmware (esp32/pulso_mqtt/pulso_mqtt.ino -> TRECHOS[]).
    // Aqui podem ter acento; no firmware não, porque o LCD não mostra acentos.
    { id: "T01", rua: "Av Paulista",          paralela: "Al Santos",         cenario: "Início" },
    { id: "T02", rua: "R Augusta",            paralela: "R Frei Caneca",     cenario: "Túnel escuro" },
    { id: "T03", rua: "R da Consolação",      paralela: "R Augusta",         cenario: "Lâmpada quente" },
    { id: "T04", rua: "Av Rebouças",          paralela: "R Teodoro Sampaio", cenario: "Lombada" },
    { id: "T05", rua: "R Oscar Freire",       paralela: "Al Lorena",         cenario: "Avenida congestionada" },
    { id: "T06", rua: "Av Brig Luís Antônio", paralela: "Av Nove de Julho",  cenario: "Rua livre" },
  ],

  /* ---------------------------------------------------------------
   * CONEXÃO MQTT (não mude os formatos das mensagens do ESP32)
   * --------------------------------------------------------------- */
  mqtt: {
    url: "wss://broker.hivemq.com:8884/mqtt",
    topicoLeituras: "pulso/equipe01/leituras",
    topicoStatus: "pulso/equipe01/status",
  },

  /* Sem status por mais desses segundos = dispositivo offline. */
  segundosParaOffline: 15,

  /* ---------------------------------------------------------------
   * CHAMADOS
   * Quantas passagens com a camada em CRITICO no mesmo trecho
   * são necessárias para abrir um chamado, e qual título ele recebe.
   * Para criar chamados de calor ou ar, basta acrescentar aqui.
   * --------------------------------------------------------------- */
  confirmacoesParaChamado: 3,
  chamados: {
    luz:       { titulo: "Poste apagado", orgao: "Subprefeitura · Iluminação" },
    pavimento: { titulo: "Buraco",        orgao: "Subprefeitura · Zeladoria" },
  },

  /* ---------------------------------------------------------------
   * TEXTOS DA VISÃO DO CIDADÃO
   * {rua} e {paralela} são trocados pelos nomes do trecho.
   * --------------------------------------------------------------- */
  dicasCidadao: {
    luz:       "O trecho da {rua} está escuro agora. Se puder, vá pela {paralela}.",
    pavimento: "Tem buraco na {rua}. Segure firme no ônibus nesse trecho.",
    calor:     "Está muito quente na {rua}. Leve água e espere na sombra.",
    ar:        "O ar está pesado na {rua}. Se tiver asma, evite esperar o ônibus ali.",
  },

  /* ---------------------------------------------------------------
   * MODO DEMONSTRAÇÃO
   * Roteiro simulado no mesmo formato do ESP32.
   * --------------------------------------------------------------- */
  demo: {
    segundosPorTrecho: 6,        // tempo que o ônibus leva em cada trecho
    segundosEntreStatus: 2,      // o ESP32 real manda a cada 5 s; no demo é mais rápido para dar vida
    horaInicial: "21:36",        // hora "do dispositivo" no começo do demo (noite: luz é avaliada)
    voltaComFalhaDeSinal: 2,     // em qual volta o sinal cai
    trechoQueCaiOSinal: "T03",   // o sinal cai logo depois de entrar neste trecho...
    trechosSemSinal: 4,          // ...e fica fora por esta quantidade de trechos
    falhaDeSensorNaVolta: 3,     // volta em que um sensor falha por alguns segundos (0 = nunca)
  },
};
