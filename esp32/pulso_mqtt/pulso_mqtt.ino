/*
  =====================================================================
  PULSO — caixa de sensores no teto do ônibus (simulação Wokwi / ESP32)
  Global Solution 2026.2 · CitizenTech · Engenharia de Software 1º ano
  =====================================================================

  Integrantes (nome completo e RM):
    - [Nome Completo 1] - RM [00000]
    - [Nome Completo 2] - RM [00000]
    - [Nome Completo 3] - RM [00000]
    - [Nome Completo 4] - RM [00000]
    - [Nome Completo 5] - RM [00000]

  Cidadão: quem anda a pé e de ônibus por São Paulo (com atenção a idosos,
  pessoas com deficiência e trabalhadores de rua expostos ao calor).
  Problema: a cidade não sabe, a tempo, quais ruas estão quentes demais,
  escuras ou esburacadas.
  ODS: 3, 9, 10, 11 e 13.

  Ciclo de borda: MEDIR -> DECIDIR -> ALERTAR -> ENVIAR (ou GUARDAR sem sinal)

  O que cada componente representa:
    DHT22 / DHT11 .... temperatura e umidade (camada CALOR). O Wokwi só tem DHT22;
                       na maquete usamos DHT11 (mude USAR_DHT11 para true)
    Sensor de luz .... luminosidade em lux (camada LUZ, avaliada só à noite)
    MPU6050 .......... vibração vertical do ônibus (camada PAVIMENTO / buraco)
    Potenciômetro .... sensor de partículas PM2.5 (camada AR). O Wokwi não tem
                       sensor de partículas; no real seria um PMS5003 ou SDS011.
    Botão azul ....... toque rápido: "ônibus chegou ao próximo trecho" (no real, viria do GPS)
                       segurar 1 s: liga/desliga o sinal de internet (simula área sem cobertura)
    LEDs + buzzer .... resposta local (pior estado do trecho atual)
    LCD 16x2 I2C ..... painel do dispositivo (páginas que se alternam a cada 2 s)

  Relógio simulado: 1 hora = 10 segundos reais (começa às 17h30, então a
  noite chega em ~5 s e a camada LUZ passa a ser avaliada).
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHTesp.h>
#include <math.h>

// ======================= CONFIGURAÇÃO WOKWI x MAQUETE FÍSICA =======================
// No Wokwi deixe tudo como está. Na maquete física:
//   USAR_DHT11 = true, LUZ_MODO_WOKWI = false e coloque a rede real em WIFI_SSID / WIFI_SENHA.
const bool USAR_DHT11     = false;
const bool LUZ_MODO_WOKWI = true;
const uint8_t ENDERECO_LCD = 0x27;   // se o LCD físico não mostrar nada, teste 0x3F

// Calibração do sensor de luz na maquete (valores lidos no Serial Monitor, campo "bruto")
const int   LUZ_BRUTO_CLARO  = 800;   // leitura com a luz normal da sala
const int   LUZ_BRUTO_ESCURO = 3500;  // leitura com o sensor dentro do túnel
const float LUZ_LUX_CLARO    = 300;   // valor em lux atribuído à luz normal da sala

// ======================= REDE / BACK-END =======================
#define USAR_MQTT true
const char* WIFI_SSID   = "Wokwi-GUEST";   // maquete: nome da rede (ex.: roteador do celular)
const char* WIFI_SENHA  = "";              // maquete: senha da rede
const char* MQTT_BROKER = "broker.hivemq.com";   // troque pelo IP do FIWARE, se a turma usar
const int   MQTT_PORTA  = 1883;
const char* ID_DISPOSITIVO  = "pulso001";
const char* TOPICO_LEITURAS = "pulso/equipe01/leituras";  // um resumo por trecho percorrido
const char* TOPICO_STATUS   = "pulso/equipe01/status";    // estado ao vivo, a cada 5 s
// Para o FIWARE (IoT Agent UltraLight 2.0), mude para true:
const bool  FORMATO_FIWARE_UL = false;
const char* TOPICO_FIWARE     = "/TEF/pulso001/attrs";

// ======================= PINOS =======================
const int PINO_DHT          = 15;
const int PINO_LUZ          = 34;   // ADC1 (funciona junto com o Wi-Fi)
const int PINO_AR           = 35;   // ADC1
const int PINO_BOTAO        = 25;
const int PINO_LED_VERDE    = 18;
const int PINO_LED_AMARELO  = 19;
const int PINO_LED_VERMELHO = 23;
const int PINO_BUZZER       = 13;
const uint8_t ENDERECO_MPU  = 0x68;

// ======================= LIMITES (justificativa nos comentários) =======================
// CALOR: alertas de calor costumam começar perto de 30 °C; acima de 35 °C o risco
// para idosos e trabalhadores de rua é alto (conferir INMET / Defesa Civil).
const float CALOR_ATENCAO = 30.0;
const float CALOR_CRITICO = 35.0;
// LUZ (à noite): referência na NBR 5101 de iluminação pública. Abaixo de 5 lux a rua
// está praticamente escura -> provável poste apagado.
const float LUZ_ATENCAO = 20.0;   // abaixo disso: iluminação fraca
const float LUZ_CRITICO = 5.0;    // abaixo disso: escuro
// PAVIMENTO: desvio da aceleração em relação à gravidade (1 g).
// 0,5 g de desvio = 1,5 g de pico total; 1,0 g de desvio = 2,0 g de pico total.
const float PAV_ATENCAO = 0.5;
const float PAV_CRITICO = 1.0;
// AR (PM2.5 em µg/m³): faixas inspiradas na classificação da CETESB e na diretriz da OMS.
const float AR_ATENCAO = 25.0;
const float AR_CRITICO = 50.0;

// Faixas físicas válidas (fora delas a leitura é descartada)
// DHT22: -40 a 80 °C e 0 a 100 %. DHT11: 0 a 50 °C e 20 a 90 %.
const float TEMP_MIN = USAR_DHT11 ? 0.0 : -40.0;
const float TEMP_MAX = USAR_DHT11 ? 50.0 : 80.0;
const float UMID_MIN = USAR_DHT11 ? 20.0 : 0.0;
const float UMID_MAX = USAR_DHT11 ? 90.0 : 100.0;
const float MAX_SALTO_TEMP = 8.0;                 // °C entre leituras de 2 s: salto impossível
const int   FALHAS_PARA_ALARME = 3;               // 3 leituras inválidas seguidas = FALHA
const unsigned long FALHA_MIN_MS = 6000;          // tempo mínimo em FALHA antes de recalibrar
const int   CONFIRMACOES_CHAMADO = 3;             // RN01: 3 passagens confirmam o problema
const unsigned long TOQUE_LONGO_MS = 1000;        // segurar o botão por 1 s alterna o sinal

// ======================= TEMPOS (millis, sem delay) =======================
const unsigned long INTERVALO_DHT     = 2000;  // o DHT22 não lê mais rápido que 0,5 Hz
const unsigned long INTERVALO_ANALOG  = 500;
const unsigned long INTERVALO_MPU     = 50;    // rápido para não perder o pico do buraco
const unsigned long INTERVALO_TELA    = 500;
const unsigned long INTERVALO_PAGINA  = 2000;  // troca de página do LCD
const unsigned long INTERVALO_SERIAL  = 2000;
const unsigned long INTERVALO_STATUS  = 5000;
const unsigned long INTERVALO_LOTE    = 300;   // ritmo de envio do buffer quando o sinal volta
                                               // (devagar o bastante para o painel mostrar a contagem subindo)
const unsigned long MS_POR_MINUTO_SIM = 1000UL / 6;  // 6 minutos simulados por segundo
const int MINUTO_INICIAL = 17 * 60 + 30;

// ======================= ROTA (linha piloto) =======================
const int NUM_TRECHOS = 6;
const char* TRECHOS[NUM_TRECHOS] = {
  "Av Paulista", "R Augusta", "R da Consolacao",
  "Av Reboucas", "R Oscar Freire", "Av Brig L Antonio"
};

// ======================= TIPOS =======================
enum Estado { NORMAL = 0, ATENCAO = 1, CRITICO = 2, NAO_AVALIADO = 3 };
const char* NOME_ESTADO[] = { "NORMAL", "ATENCAO", "CRITICO", "---" };

// Média móvel das últimas N leituras (suavização)
template <int N>
struct MediaMovel {
  float v[N];
  int qtd = 0, pos = 0;
  void adicionar(float x) { v[pos] = x; pos = (pos + 1) % N; if (qtd < N) qtd++; }
  bool vazia() const { return qtd == 0; }
  float media() const {
    if (qtd == 0) return NAN;
    float s = 0; for (int i = 0; i < qtd; i++) s += v[i];
    return s / qtd;
  }
};

// Resumo de um trecho percorrido (é o que vai para o back-end)
struct LeituraTrecho {
  uint8_t trecho;
  uint16_t passagem;
  uint16_t minutoDia;
  float temp, umid, lux, impacto, pm;
  uint8_t est[4];  // calor, luz, pavimento, ar
};

// ======================= OBJETOS E ESTADO GLOBAL =======================
LiquidCrystal_I2C lcd(ENDERECO_LCD, 16, 2);
DHTesp dht;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

MediaMovel<5> mediaTemp, mediaUmid, mediaAr;
MediaMovel<3> mediaLuz;

float ultimaTempValida = NAN;
int   falhasSeguidas = 0;
bool  falhaSensor = false;
unsigned long falhaDesde = 0;
bool  mpuOk = false;
float picoImpacto = 0;          // maior desvio sentido no trecho atual (pico, não média)

int trechoAtual = 0;
uint16_t passagem = 1;
int suspeitasLuz[NUM_TRECHOS] = {0};
int suspeitasPav[NUM_TRECHOS] = {0};
bool chamadoLuz[NUM_TRECHOS] = {false};
bool chamadoPav[NUM_TRECHOS] = {false};

// Buffer circular para o modo offline
const int TAM_BUFFER = 50;
LeituraTrecho buffer[TAM_BUFFER];
int bufInicio = 0, bufQtd = 0, bufPerdidas = 0;

Estado estadoGeralAnterior = NORMAL;
bool falhaAnterior = false;

bool botaoUltimaLeitura = HIGH, botaoEstavel = HIGH;
unsigned long botaoMudouEm = 0;
unsigned long botaoApertadoEm = 0;
bool toqueLongoUsado = false;
bool sinalSimulado = true;        // começa COM sinal; o toque longo alterna

char aviso[22] = "";
unsigned long avisoAte = 0;

unsigned long tDht = 0, tAnalog = 0, tMpu = 0, tTela = 0, tSerial = 0, tStatus = 0, tMqtt = 0, tLote = 0;
bool statusAntesDoLote = false;   // ao voltar o sinal, avisa o painel do tamanho do buffer antes de esvaziá-lo
unsigned long inicioRelogio = 0;
int luzBruta = 0;                 // leitura crua do sensor de luz (para calibrar)
int pagina = 0;
unsigned long tPagina = 0;

// ======================= RELÓGIO SIMULADO =======================
int minutoDoDia() {
  return (MINUTO_INICIAL + (millis() - inicioRelogio) / MS_POR_MINUTO_SIM) % 1440;
}
bool ehNoite() {
  int h = minutoDoDia() / 60;
  return h >= 18 || h < 6;   // RN02: iluminação só é avaliada entre 18h e 6h
}

// ======================= LEITURA E VALIDAÇÃO DOS SENSORES =======================
void registrarFalhaLeitura(const char* motivo) {
  falhasSeguidas++;
  Serial.printf("[AVISO] Leitura de temperatura descartada (%s). Falhas seguidas: %d\n", motivo, falhasSeguidas);
  if (falhasSeguidas >= FALHAS_PARA_ALARME && !falhaSensor) {
    falhaSensor = true;
    falhaDesde = millis();
    Serial.println("[FALHA] Sensor de temperatura não confiável. Leituras suspensas.");
  }
}

void lerDHT() {
  TempAndHumidity d = dht.getTempAndHumidity();

  // Depois de um tempo em FALHA, aceita um novo valor de referência
  if (falhaSensor && millis() - falhaDesde > FALHA_MIN_MS) ultimaTempValida = NAN;

  if (dht.getStatus() != 0 || isnan(d.temperature) || isnan(d.humidity)) {
    registrarFalhaLeitura("sensor não respondeu");
    return;
  }
  if (d.temperature < TEMP_MIN || d.temperature > TEMP_MAX || d.humidity < UMID_MIN || d.humidity > UMID_MAX) {
    registrarFalhaLeitura("fora da faixa física");
    return;
  }
  if (!isnan(ultimaTempValida) && fabs(d.temperature - ultimaTempValida) > MAX_SALTO_TEMP) {
    registrarFalhaLeitura("salto impossível em 2 s");
    return;
  }

  // Leitura válida
  if (falhaSensor) Serial.println("[OK] Sensor de temperatura voltou a responder.");
  falhaSensor = false;
  falhasSeguidas = 0;
  ultimaTempValida = d.temperature;
  mediaTemp.adicionar(d.temperature);
  mediaUmid.adicionar(d.humidity);
}

float converterParaLux(int leitura) {
  if (!LUZ_MODO_WOKWI) {
    // Maquete física: escala linear entre as leituras de "escuro" e "claro" medidas pela equipe
    if (LUZ_BRUTO_CLARO == LUZ_BRUTO_ESCURO) return NAN;
    float fracao = (float)(leitura - LUZ_BRUTO_ESCURO) / (LUZ_BRUTO_CLARO - LUZ_BRUTO_ESCURO);
    return constrain(fracao, 0.0f, 1.0f) * LUZ_LUX_CLARO;
  }
  // Conversão do módulo fotoresistor do Wokwi (divisor com LDR GL5528), adaptada para 3,3 V
  const float GAMMA = 0.7, RL10 = 50;
  float tensao = leitura / 4095.0 * 3.3;
  if (tensao >= 3.29) return 0;                 // praticamente sem luz
  float resistencia = 2000 * tensao / (1 - tensao / 3.3);
  if (resistencia <= 0) return NAN;             // leitura impossível
  return pow(RL10 * 1e3 * pow(10, GAMMA) / resistencia, 1 / GAMMA);
}

void lerAnalogicos() {
  luzBruta = analogRead(PINO_LUZ);
  float lux = converterParaLux(luzBruta);
  if (isfinite(lux) && lux >= 0) mediaLuz.adicionar(lux);
  else Serial.println("[AVISO] Leitura de luz inválida descartada.");

  // Potenciômetro 0..4095 representa 0..150 µg/m³ de PM2.5
  float pm = analogRead(PINO_AR) / 4095.0 * 150.0;
  mediaAr.adicionar(pm);
}

bool iniciarMPU() {
  Wire.beginTransmission(ENDERECO_MPU);
  Wire.write(0x6B);  // registrador de energia
  Wire.write(0x00);  // acorda o sensor
  return Wire.endTransmission() == 0;
}

void lerVibracao() {
  if (!mpuOk) return;
  Wire.beginTransmission(ENDERECO_MPU);
  Wire.write(0x3B);  // início dos registradores de aceleração
  if (Wire.endTransmission(false) != 0) return;
  if (Wire.requestFrom((uint8_t)ENDERECO_MPU, (uint8_t)6) != 6) return;

  int16_t brutoX = (Wire.read() << 8) | Wire.read();
  int16_t brutoY = (Wire.read() << 8) | Wire.read();
  int16_t brutoZ = (Wire.read() << 8) | Wire.read();
  float ax = brutoX / 16384.0, ay = brutoY / 16384.0, az = brutoZ / 16384.0;  // escala ±2 g

  // Desvio em relação à gravidade: parado = 0; buraco = pico alto
  float desvio = fabs(sqrt(ax * ax + ay * ay + az * az) - 1.0);
  if (desvio > picoImpacto) picoImpacto = desvio;
}

// ======================= DECISÃO (CLASSIFICAÇÃO) =======================
Estado classificarAcima(float valor, float atencao, float critico) {
  if (isnan(valor)) return NAO_AVALIADO;
  if (valor > critico) return CRITICO;
  if (valor >= atencao) return ATENCAO;
  return NORMAL;
}

Estado classificarCalor()     { return falhaSensor ? NAO_AVALIADO : classificarAcima(mediaTemp.media(), CALOR_ATENCAO, CALOR_CRITICO); }
Estado classificarAr()        { return classificarAcima(mediaAr.media(), AR_ATENCAO, AR_CRITICO); }
Estado classificarPavimento() { return mpuOk ? classificarAcima(picoImpacto, PAV_ATENCAO, PAV_CRITICO) : NAO_AVALIADO; }

Estado classificarLuz() {
  if (!ehNoite() || mediaLuz.vazia()) return NAO_AVALIADO;
  float lux = mediaLuz.media();
  if (lux < LUZ_CRITICO) return CRITICO;
  if (lux < LUZ_ATENCAO) return ATENCAO;
  return NORMAL;
}

Estado estadoGeral() {
  Estado estados[4] = { classificarCalor(), classificarLuz(), classificarPavimento(), classificarAr() };
  Estado pior = NORMAL;
  for (int i = 0; i < 4; i++) {
    if (estados[i] != NAO_AVALIADO && estados[i] > pior) pior = estados[i];
  }
  return pior;
}

// ======================= RESPOSTA LOCAL (LEDs e buzzer) =======================
void atualizarAlertas() {
  Estado geral = estadoGeral();
  bool pisca = (millis() / 300) % 2;

  if (falhaSensor) {
    digitalWrite(PINO_LED_VERDE, LOW);
    digitalWrite(PINO_LED_AMARELO, pisca);    // amarelo piscando = FALHA DE SENSOR
    digitalWrite(PINO_LED_VERMELHO, LOW);
  } else {
    digitalWrite(PINO_LED_VERDE,    geral == NORMAL);
    digitalWrite(PINO_LED_AMARELO,  geral == ATENCAO);
    digitalWrite(PINO_LED_VERMELHO, geral == CRITICO);
  }

  // Sons diferentes para cada tipo de evento (só na mudança de estado)
  if (falhaSensor && !falhaAnterior) {
    tone(PINO_BUZZER, 400, 600);              // grave e longo: falha
  } else if (!falhaSensor && geral != estadoGeralAnterior) {
    if (geral == CRITICO) tone(PINO_BUZZER, 2000, 350);      // agudo: crítico
    else if (geral == ATENCAO) tone(PINO_BUZZER, 1000, 120); // curto: atenção
  }
  estadoGeralAnterior = geral;
  falhaAnterior = falhaSensor;
}

// ======================= ENVIO E MODO OFFLINE =======================
bool sinalDisponivel() { return sinalSimulado; }
bool online() { return USAR_MQTT && sinalDisponivel() && mqtt.connected(); }

void numOuNull(char* saida, size_t n, float v, int casas) {
  if (isnan(v)) snprintf(saida, n, "null");
  else snprintf(saida, n, "%.*f", casas, v);
}

bool publicarLeitura(const LeituraTrecho& L, bool veioDoBuffer) {
  char t[12], h[12], l[12], v[12], p[12], msg[420];
  numOuNull(t, sizeof(t), L.temp, 1);
  numOuNull(h, sizeof(h), L.umid, 0);
  numOuNull(l, sizeof(l), L.lux, 0);
  numOuNull(v, sizeof(v), L.impacto, 2);
  numOuNull(p, sizeof(p), L.pm, 0);

  if (FORMATO_FIWARE_UL) {
    snprintf(msg, sizeof(msg), "t|%s|h|%s|l|%s|v|%s|p|%s|tr|%d|ec|%s|el|%s|ep|%s|ea|%s",
             t, h, l, v, p, L.trecho + 1, NOME_ESTADO[L.est[0]], NOME_ESTADO[L.est[1]],
             NOME_ESTADO[L.est[2]], NOME_ESTADO[L.est[3]]);
    return mqtt.publish(TOPICO_FIWARE, msg);
  }
  snprintf(msg, sizeof(msg),
           "{\"dispositivo\":\"%s\",\"trecho\":\"T%02d\",\"nome\":\"%s\",\"passagem\":%u,"
           "\"hora\":\"%02u:%02u\",\"temp_c\":%s,\"umid\":%s,\"lux\":%s,\"impacto_g\":%s,\"pm25\":%s,"
           "\"estados\":{\"calor\":\"%s\",\"luz\":\"%s\",\"pavimento\":\"%s\",\"ar\":\"%s\"},"
           "\"enviado_offline\":%s}",
           ID_DISPOSITIVO, L.trecho + 1, TRECHOS[L.trecho], L.passagem,
           L.minutoDia / 60, L.minutoDia % 60, t, h, l, v, p,
           NOME_ESTADO[L.est[0]], NOME_ESTADO[L.est[1]], NOME_ESTADO[L.est[2]], NOME_ESTADO[L.est[3]],
           veioDoBuffer ? "true" : "false");
  return mqtt.publish(TOPICO_LEITURAS, msg);
}

void guardarOffline(const LeituraTrecho& L) {
  int indice = (bufInicio + bufQtd) % TAM_BUFFER;
  buffer[indice] = L;
  if (bufQtd < TAM_BUFFER) {
    bufQtd++;
  } else {
    bufInicio = (bufInicio + 1) % TAM_BUFFER;  // buffer cheio: descarta a mais antiga
    bufPerdidas++;
  }
  statusAntesDoLote = false;   // na próxima reconexão, o status sai antes do lote
  Serial.printf("[OFFLINE] Sem sinal. Leitura guardada (%d no buffer).\n", bufQtd);
}

void publicarStatus();   // definida mais abaixo

// Chamada a cada INTERVALO_LOTE enquanto houver buffer e sinal: envia UMA leitura por vez.
// Antes da primeira, publica um status com o tamanho do buffer (o painel mostra
// "N leituras no buffer" e depois a contagem "recebidas após reconexão" subindo).
void enviarLote() {
  if (!statusAntesDoLote) {
    publicarStatus();
    statusAntesDoLote = true;
    tStatus = millis();
    return;                      // a primeira leitura sai na próxima chamada
  }
  if (!publicarLeitura(buffer[bufInicio], true)) return;   // falhou: tenta de novo depois
  bufInicio = (bufInicio + 1) % TAM_BUFFER;
  bufQtd--;
  Serial.printf("[ONLINE] Leitura do buffer enviada. Restam %d.\n", bufQtd);
  if (bufQtd == 0) {
    statusAntesDoLote = false;
    snprintf(aviso, sizeof(aviso), "Lote enviado!");
    avisoAte = millis() + 2000;
  }
}

void publicarStatus() {
  char t[12], l[12], v[12], p[12], msg[300];
  numOuNull(t, sizeof(t), mediaTemp.media(), 1);
  numOuNull(l, sizeof(l), mediaLuz.media(), 0);
  numOuNull(v, sizeof(v), picoImpacto, 2);
  numOuNull(p, sizeof(p), mediaAr.media(), 0);
  int m = minutoDoDia();
  snprintf(msg, sizeof(msg),
           "{\"dispositivo\":\"%s\",\"trecho\":\"T%02d\",\"hora\":\"%02d:%02d\",\"temp_c\":%s,\"lux\":%s,"
           "\"impacto_g\":%s,\"pm25\":%s,\"geral\":\"%s\",\"falha_sensor\":%s,\"buffer\":%d}",
           ID_DISPOSITIVO, trechoAtual + 1, m / 60, m % 60, t, l, v, p,
           falhaSensor ? "FALHA" : NOME_ESTADO[estadoGeral()], falhaSensor ? "true" : "false", bufQtd);
  mqtt.publish(TOPICO_STATUS, msg);
}

// ======================= CONFIRMAÇÃO DE CHAMADOS (RN01) =======================
void verificarChamado(int* suspeitas, bool* chamadoAberto, Estado estado, const char* problema) {
  int i = trechoAtual;
  if (estado == CRITICO) {
    suspeitas[i]++;
    Serial.printf("  -> %s suspeito em %s (%d/%d passagens)\n", problema, TRECHOS[i], suspeitas[i], CONFIRMACOES_CHAMADO);
    if (suspeitas[i] >= CONFIRMACOES_CHAMADO && !chamadoAberto[i]) {
      chamadoAberto[i] = true;
      Serial.printf("  ** CHAMADO SUGERIDO: %s em %s (confirmado em %d passagens) **\n", problema, TRECHOS[i], suspeitas[i]);
      snprintf(aviso, sizeof(aviso), "CHAMADO: T%02d", i + 1);
      avisoAte = millis() + 2500;
    }
  } else if (estado == NORMAL) {
    if (chamadoAberto[i]) Serial.printf("  -> %s em %s parece resolvido.\n", problema, TRECHOS[i]);
    suspeitas[i] = 0;
    chamadoAberto[i] = false;
  }
}

// ======================= FECHAR TRECHO (botão) =======================
void fecharTrecho() {
  LeituraTrecho L;
  L.trecho = trechoAtual;
  L.passagem = passagem;
  L.minutoDia = minutoDoDia();
  L.temp = falhaSensor ? NAN : mediaTemp.media();
  L.umid = falhaSensor ? NAN : mediaUmid.media();
  L.lux = ehNoite() ? mediaLuz.media() : NAN;
  L.impacto = mpuOk ? picoImpacto : NAN;
  L.pm = mediaAr.media();
  Estado ec = classificarCalor(), el = classificarLuz(), ep = classificarPavimento(), ea = classificarAr();
  L.est[0] = ec; L.est[1] = el; L.est[2] = ep; L.est[3] = ea;

  Serial.println("------------------------------------------------------------");
  Serial.printf("TRECHO T%02d %s concluído (passagem %u)\n", trechoAtual + 1, TRECHOS[trechoAtual], passagem);
  Serial.printf("  Calor %s | Luz %s | Pavimento %s | Ar %s\n",
                NOME_ESTADO[ec], NOME_ESTADO[el], NOME_ESTADO[ep], NOME_ESTADO[ea]);
  verificarChamado(suspeitasLuz, chamadoLuz, el, "Poste apagado");
  verificarChamado(suspeitasPav, chamadoPav, ep, "Buraco");

  // Se o envio falhar (mesmo "online"), a leitura vai para o buffer em vez de se perder.
  if (online() && publicarLeitura(L, false)) {
    Serial.println("  Enviado ao back-end.");
  } else {
    guardarOffline(L);
  }
  Serial.println("------------------------------------------------------------");

  // Avança para o próximo trecho
  picoImpacto = 0;
  trechoAtual++;
  if (trechoAtual >= NUM_TRECHOS) { trechoAtual = 0; passagem++; }
  if (avisoAte < millis()) {
    snprintf(aviso, sizeof(aviso), "Indo p/ T%02d", trechoAtual + 1);
    avisoAte = millis() + 1500;
  }
}

void alternarSinal() {
  sinalSimulado = !sinalSimulado;
  tone(PINO_BUZZER, sinalSimulado ? 1500 : 600, 150);
  snprintf(aviso, sizeof(aviso), sinalSimulado ? "Sinal voltou" : "Sem sinal");
  avisoAte = millis() + 1500;
  Serial.println(sinalSimulado ? "[REDE] Sinal restabelecido (toque longo)." : "[REDE] Ônibus entrou em área sem sinal (toque longo).");
}

// Um botão, duas funções:
//   toque rápido  -> fecha o trecho atual e vai para o próximo
//   segurar 1 s   -> liga/desliga o sinal de internet (modo offline)
void lerBotao() {
  bool leitura = digitalRead(PINO_BOTAO);
  if (leitura != botaoUltimaLeitura) { botaoMudouEm = millis(); botaoUltimaLeitura = leitura; }
  if (millis() - botaoMudouEm > 40 && leitura != botaoEstavel) {
    botaoEstavel = leitura;
    if (botaoEstavel == LOW) {                 // acabou de apertar
      botaoApertadoEm = millis();
      toqueLongoUsado = false;
    } else if (!toqueLongoUsado) {             // soltou antes de 1 s
      fecharTrecho();
    }
  }
  // Ainda segurando: ao completar 1 s, alterna o sinal uma única vez
  if (botaoEstavel == LOW && !toqueLongoUsado && millis() - botaoApertadoEm >= TOQUE_LONGO_MS) {
    toqueLongoUsado = true;
    alternarSinal();
  }
}

// ======================= DISPLAY E SERIAL =======================
void escreverLinha(int linha, const char* texto) {
  char buf[17];
  snprintf(buf, sizeof(buf), "%-16s", texto);   // completa com espaços: apaga o que sobrou
  lcd.setCursor(0, linha);
  lcd.print(buf);
}

// O LCD só mostra 32 caracteres, então a tela alterna entre 5 páginas a cada 2 s
void desenharTela() {
  char l1[24], l2[24];
  if (millis() < avisoAte) { escreverLinha(0, aviso); escreverLinha(1, ""); return; }
  if (millis() - tPagina >= INTERVALO_PAGINA) { tPagina = millis(); pagina = (pagina + 1) % 5; }

  int m = minutoDoDia();
  switch (pagina) {
    case 0:
      snprintf(l1, sizeof(l1), "T%02d %s", trechoAtual + 1, TRECHOS[trechoAtual]);
      snprintf(l2, sizeof(l2), "%02d:%02d %s Buf %d", m / 60, m % 60, online() ? "ON " : "OFF", bufQtd);
      break;
    case 1:
      snprintf(l1, sizeof(l1), "Calor %s", falhaSensor ? "FALHA" : NOME_ESTADO[classificarCalor()]);
      if (falhaSensor) snprintf(l2, sizeof(l2), "sensor suspenso");
      else if (mediaTemp.vazia()) snprintf(l2, sizeof(l2), "lendo...");
      else snprintf(l2, sizeof(l2), "%.1f C  %.0f%%", mediaTemp.media(), mediaUmid.media());
      break;
    case 2:
      snprintf(l1, sizeof(l1), "Luz %s", NOME_ESTADO[classificarLuz()]);
      if (ehNoite()) snprintf(l2, sizeof(l2), "%.0f lux", mediaLuz.media());
      else snprintf(l2, sizeof(l2), "dia: nao avalia");
      break;
    case 3:
      snprintf(l1, sizeof(l1), "Pav %s", NOME_ESTADO[classificarPavimento()]);
      if (mpuOk) snprintf(l2, sizeof(l2), "pico %.2f g", picoImpacto);
      else snprintf(l2, sizeof(l2), "sem MPU6050");
      break;
    default:
      snprintf(l1, sizeof(l1), "Ar %s", NOME_ESTADO[classificarAr()]);
      snprintf(l2, sizeof(l2), "%.0f ug/m3 PM2.5", mediaAr.media());
      break;
  }
  escreverLinha(0, l1);
  escreverLinha(1, l2);
}

void imprimirSerial() {
  int m = minutoDoDia();
  Serial.printf("[%02d:%02d] T%02d %-18s | Calor %5.1fC %-7s | Luz %6.0flx (bruto %4d) %-7s | Pav %4.2fg %-7s | Ar %3.0fug %-7s | %s | buffer %d\n",
                m / 60, m % 60, trechoAtual + 1, TRECHOS[trechoAtual],
                mediaTemp.media(), falhaSensor ? "FALHA" : NOME_ESTADO[classificarCalor()],
                mediaLuz.media(), luzBruta, NOME_ESTADO[classificarLuz()],
                picoImpacto, NOME_ESTADO[classificarPavimento()],
                mediaAr.media(), NOME_ESTADO[classificarAr()],
                online() ? "ONLINE" : "OFFLINE", bufQtd);
}

// ======================= REDE =======================
void cuidarDaRede() {
  if (!USAR_MQTT || WiFi.status() != WL_CONNECTED) return;
  if (!mqtt.connected() && millis() - tMqtt > 5000) {
    tMqtt = millis();
    char id[24];
    snprintf(id, sizeof(id), "pulso-%06lX", (unsigned long)(ESP.getEfuseMac() & 0xFFFFFF));
    if (mqtt.connect(id)) Serial.printf("[REDE] Conectado ao broker. Tópico: %s\n", FORMATO_FIWARE_UL ? TOPICO_FIWARE : TOPICO_LEITURAS);
  }
  mqtt.loop();
}

// ======================= SETUP E LOOP =======================
void setup() {
  Serial.begin(115200);
  pinMode(PINO_BOTAO, INPUT_PULLUP);
  pinMode(PINO_LED_VERDE, OUTPUT);
  pinMode(PINO_LED_AMARELO, OUTPUT);
  pinMode(PINO_LED_VERMELHO, OUTPUT);
  pinMode(PINO_BUZZER, OUTPUT);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  escreverLinha(0, "     PULSO");
  escreverLinha(1, "  iniciando...");

  dht.setup(PINO_DHT, USAR_DHT11 ? DHTesp::DHT11 : DHTesp::DHT22);
  mpuOk = iniciarMPU();
  if (!mpuOk) Serial.println("[ERRO] MPU6050 não respondeu. Camada pavimento desativada.");

  if (USAR_MQTT) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_SENHA, 6);
    mqtt.setServer(MQTT_BROKER, MQTT_PORTA);
    mqtt.setBufferSize(512);   // as mensagens JSON passam do padrão de 256 bytes
    mqtt.setSocketTimeout(3);
  }

  Serial.println();
  Serial.println("============================================================");
  Serial.println(" PULSO - simulação (1 hora = 10 segundos)");
  Serial.println(" Ajuste os sensores e aperte o botão azul para fechar o trecho.");
  Serial.println(" Toque rápido no botão: próximo trecho. Segurar 1 s: liga/desliga o sinal.");
  Serial.println("============================================================");
  inicioRelogio = millis();
}

void loop() {
  unsigned long agora = millis();

  if (agora - tMpu    >= INTERVALO_MPU)    { tMpu = agora;    lerVibracao(); }
  if (agora - tAnalog >= INTERVALO_ANALOG) { tAnalog = agora; lerAnalogicos(); }
  if (agora - tDht    >= INTERVALO_DHT)    { tDht = agora;    lerDHT(); }

  lerBotao();
  atualizarAlertas();
  cuidarDaRede();
  if (bufQtd > 0 && online() && agora - tLote >= INTERVALO_LOTE) { tLote = agora; enviarLote(); }

  if (agora - tTela   >= INTERVALO_TELA)   { tTela = agora;   desenharTela(); }
  if (agora - tSerial >= INTERVALO_SERIAL) { tSerial = agora; imprimirSerial(); }
  if (online() && agora - tStatus >= INTERVALO_STATUS) { tStatus = agora; publicarStatus(); }
}