# Como conectar o ESP32 ao painel

```
ESP32 (Wokwi ou maquete) ──Wi-Fi──► broker.hivemq.com ──internet──► painel (navegador)
     publica MQTT, porta 1883              repassa          assina via wss://, porta 8884
```

O ESP32 e o painel **não se conectam diretamente**. Os dois falam com o mesmo broker MQTT
público e combinam dois tópicos: o ESP32 publica e o painel assina. Basta que os dois tenham
internet; podem estar em lugares diferentes.

O firmware fica em [`esp32/pulso_mqtt/`](../esp32/pulso_mqtt/):

| Arquivo | O que é |
|---|---|
| `pulso_mqtt.ino` | O programa: mede, classifica, alerta no LCD/LEDs/buzzer e envia (ou guarda sem sinal) |
| `diagram.json` | A montagem do circuito no Wokwi |
| `libraries.txt` | As bibliotecas que o Wokwi instala |

---

## 1. Rodar no Wokwi

1. Em https://wokwi.com, crie um projeto **ESP32**.
2. Substitua o `sketch.ino` pelo conteúdo de `pulso_mqtt.ino` e o `diagram.json` pelo da pasta.
3. Crie (ou edite) a aba `libraries.txt` com:
   ```
   LiquidCrystal I2C
   PubSubClient
   DHT sensor library for ESPx
   ```
4. Clique em ▶. O Serial Monitor deve mostrar `[REDE] Conectado ao broker.` em alguns segundos.
   O Wokwi já se conecta à rede `Wokwi-GUEST` (canal 6), que tem saída para a internet.
5. Abra o painel (`index.html`) e aperte `L` (modo ao vivo). Em até 5 s o cabeçalho mostra
   **Conectado**.

## 2. A montagem

| Peça no Wokwi | Pino do ESP32 | Camada / função |
|---|---|---|
| DHT22 | D15 | Calor (temperatura e umidade) |
| Sensor de luz (fotoresistor) | D34 | Luz, avaliada só à noite |
| Potenciômetro | D35 | Ar: representa o PM2.5 (0 a 150 µg/m³) |
| MPU6050 | SDA D21 · SCL D22 | Pavimento: pico de vibração (buraco) |
| LCD 16x2 I2C (0x27) | SDA D21 · SCL D22 | Painel do dispositivo |
| Botão azul | D25 | Toque rápido: fecha o trecho. Segurar 1 s: liga/desliga o sinal |
| LEDs verde · amarelo · vermelho | D18 · D19 · D23 | Pior estado do trecho atual (amarelo piscando = falha de sensor) |
| Buzzer | D13 | Som curto na mudança de estado |

## 3. Como o firmware conversa com o painel

| Momento | O que o ESP32 publica | O que o painel faz |
|---|---|---|
| A cada 5 s (com sinal) | `status` com o trecho atual, valores ao vivo, `geral` e `buffer` | Atualiza o trecho atual e mantém "Conectado" |
| Toque rápido no botão | `leituras` com o resumo do trecho que terminou | Pinta o trecho no mapa, conta confirmações e anda o ônibus |
| Segurar o botão 1 s | Para de publicar e passa a guardar no buffer | Após 15 s sem mensagens: "Sem sinal há N s" e ônibus cinza |
| Segurar de novo | Um `status` com o tamanho do buffer e, depois, as leituras guardadas (uma a cada 0,3 s, com `enviado_offline: true`) | "N leituras no buffer" e, em seguida, "N leituras recebidas após reconexão" |

**Relógio simulado:** no firmware, 1 hora passa em 10 segundos e o dia começa às 17h30. Em
cerca de 5 s chega a noite e a camada de luz passa a ser avaliada (de dia ela vai como `"---"`).
A "hora no ônibus" do painel acompanha esse relógio rápido.

**Nomes das ruas:** o painel mostra os nomes do `config.js`. Eles estão iguais aos de
`TRECHOS[]` no firmware (no painel com acento, porque o LCD não mostra acentos). Se mudar
um lado, mude o outro.

## 4. Roteiro para reproduzir a história do vídeo

Antes de fechar cada trecho, ajuste os sensores no Wokwi (clique na peça durante a simulação)
e depois dê um **toque rápido** no botão azul:

| Trecho | Ajuste | Resultado esperado |
|---|---|---|
| T01 Av Paulista | Nada (26 °C, 300 lux, potenciômetro em 0) | Tudo normal |
| T02 R Augusta | Luz abaixo de **5 lux** | Luz crítica: "poste apagado" (1/3, 2/3, 3/3) |
| T03 R da Consolação | Luz de volta a 300; temperatura **em passos**: 26 → 33 → 39 °C, esperando 2 s entre eles; fique uns **10 s** em 39 °C | Calor crítico |
| T04 Av Rebouças | Temperatura de volta **em passos** (39 → 32 → 26); no MPU6050, **accelZ = 2,2** por um instante e de volta a **1** | Pavimento crítico: "buraco" (o firmware guarda o pico do trecho) |
| T05 R Oscar Freire | Potenciômetro acima de **1/3** (mais de 50 µg/m³) | Ar crítico |
| T06 Av Brig Luís Antônio | Potenciômetro de volta a 0 | Tudo normal; a volta termina e `passagem` soma 1 |

Por que os passos na temperatura: o firmware descarta saltos de mais de **8 °C** entre duas
leituras (`MAX_SALTO_TEMP`, para pegar sensor com defeito) e classifica o calor pela **média das
últimas 5 leituras** (uma a cada 2 s). Um salto direto de 26 para 39 °C vira "falha de sensor",
não "calor crítico". Luz e ar respondem em 1 a 3 s.

Repita por **3 voltas**. Na 3ª passagem com luz crítica no T02 nasce o chamado **Poste apagado**,
e no T04 o **Buraco**. Nesse momento o LCD mostra `CHAMADO: T02` e o painel exibe a notificação.

- **Queda de sinal:** na volta 2, segure o botão 1 s, feche 3 ou 4 trechos, espere passar de
  15 s e segure 1 s de novo.
- **Falha de sensor:** mude a temperatura do DHT22 de uma vez, em mais de **8 °C** (um salto
  impossível em 2 s). Depois de 3 leituras descartadas, o firmware declara `FALHA`. O LED amarelo
  pisca e o painel mostra "Falha de sensor".

## 5. Testar por partes

1. **Serial Monitor (115200):** a cada 2 s aparece uma linha com todas as camadas e `ONLINE`/`OFFLINE`.
2. **Mensagens no broker, sem o painel:** abra https://www.hivemq.com/demos/websocket-client/,
   clique em *Connect* e assine `pulso/equipe01/#`.
3. **Painel:** `index.html`, tecla `L`.
4. **Sem o ESP32:** `testar-mqtt.html` publica mensagens iguais às do firmware.

## 6. Levar para a maquete física

No topo do `.ino`:

| Constante | Wokwi | Maquete |
|---|---|---|
| `USAR_DHT11` | `false` | `true` (a maquete usa DHT11) |
| `LUZ_MODO_WOKWI` | `true` | `false` e calibre `LUZ_BRUTO_CLARO` / `LUZ_BRUTO_ESCURO` com o valor "bruto" do Serial |
| `WIFI_SSID` / `WIFI_SENHA` | `Wokwi-GUEST` / vazio | Rede de **2,4 GHz** (o roteador do celular funciona bem) |
| `ENDERECO_LCD` | `0x27` | `0x27`; se não aparecer nada, `0x3F` |

Na placa real, instale as mesmas três bibliotecas pela Arduino IDE e escolha a placa **ESP32 Dev Module**.

`WiFi.begin(..., 6)` fixa o canal 6, que é o da rede do Wokwi. Se a maquete não conectar
numa rede real, troque por `WiFi.begin(WIFI_SSID, WIFI_SENHA)`.

## 7. O formato que o painel espera

Não mude nomes de campos nem formatos. O firmware já envia exatamente isto:

```json
// pulso/equipe01/leituras  (um por trecho concluído)
{"dispositivo":"pulso001","trecho":"T02","nome":"R Augusta","passagem":1,"hora":"21:40",
 "temp_c":34.2,"umid":41,"lux":3,"impacto_g":0.12,"pm25":38,
 "estados":{"calor":"ATENCAO","luz":"CRITICO","pavimento":"NORMAL","ar":"NORMAL"},
 "enviado_offline":false}

// pulso/equipe01/status  (a cada 5 s)
{"dispositivo":"pulso001","trecho":"T02","hora":"21:40","temp_c":34.2,"lux":3,
 "impacto_g":0.12,"pm25":38,"geral":"CRITICO","falha_sensor":false,"buffer":0}
```

- Estados: `NORMAL`, `ATENCAO`, `CRITICO` ou `---`; `geral` pode ser `FALHA`. Sensor sem leitura vai como `null`.
- **Quem classifica é o ESP32.** O painel não recalcula nada: só exibe, conta as passagens e abre os chamados.
- `FORMATO_FIWARE_UL = true` troca as leituras para UltraLight 2.0 no tópico `/TEF/pulso001/attrs`.
  **O painel não lê esse formato.** Deixe `false` para a demonstração.

## 8. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Wokwi não compila: `LiquidCrystal_I2C.h` ou `DHTesp.h` não encontrado | Falta o `libraries.txt` | Crie o arquivo com as 3 bibliotecas (seção 1) |
| Serial não mostra "Conectado ao broker" | Broker fora do ar ou rede sem saída | Teste o passo 2 da seção 5; na maquete, use o roteador do celular |
| Painel em "Aguardando o ESP32" | Painel no modo demonstração, ou tópicos diferentes | Aperte `L`; compare os tópicos do `.ino` com os do `config.js` |
| Status chega, mas o mapa não pinta | Nenhum trecho foi fechado ainda | Dê um toque rápido no botão azul |
| Luz sempre "não avaliado" | Ainda é dia no relógio simulado | Espere ~5 s após iniciar (a noite começa às 18h simuladas) |
| Chamado não nasce | A camada não ficou **CRITICO** nas 3 voltas, ou ficou NORMAL no meio | Uma passagem NORMAL zera a contagem; mantenha o ajuste nas 3 voltas |
| Calor vira "falha de sensor" em vez de crítico | A temperatura mudou mais de 8 °C de uma vez | Suba em passos de até 8 °C, com 2 s entre eles (seção 4) |
| Pavimento não fica crítico | O pico foi pequeno | Leve o accelZ a 2,2 ou mais (desvio acima de 1 g) antes de fechar o trecho |
| Conecta e cai sem parar | Duas simulações abertas com o mesmo chip | Feche a outra aba do Wokwi |

## 9. Cuidados com o broker público

- O `broker.hivemq.com` é gratuito e **aberto**: qualquer pessoa que souber o tópico pode ler ou
  publicar. Não mande dados pessoais. Para mais privacidade, troque `equipe01` por um nome difícil
  de adivinhar nos **dois** lados (`.ino` e `config.js`).
- Ele não garante funcionamento. Antes de gravar, confira com o passo 2 da seção 5. Se estiver
  fora do ar, grave no modo demonstração (`D`).
