# Pulso · Painel de demonstração

Painel que recebe os dados da maquete com ESP32 (via MQTT) e mostra tudo ao vivo:
mapa da linha, trecho atual, conexão e buffer, confirmações, chamados, linha do tempo
e a visão do cidadão. Feito para ser filmado em 1920×1080.

É um site estático: HTML, CSS e JavaScript puro, **sem instalação e sem build**.
O cliente MQTT está copiado em `vendor/`, então só o broker e as fontes vêm da internet.

**Conectar o ESP32 da maquete:** veja [docs/CONECTAR-ESP32.md](docs/CONECTAR-ESP32.md)
(Wokwi, montagem, roteiro para o vídeo, maquete física e problemas comuns) e o firmware em
[esp32/pulso_mqtt/](esp32/pulso_mqtt/pulso_mqtt.ino) (com `diagram.json` e `libraries.txt` do Wokwi).

## Telas

O painel tem quatro telas, trocadas pelas abas do topo ou pelas teclas **1 a 4**
(dá para gravar uma cena por tela sem mostrar o mouse):

| Tecla | Tela | Para quê |
|---|---|---|
| `1` | **Linha** | A tela principal. À esquerda, o percurso com o estado de cada trecho e a volta atual. À direita, o trecho onde o ônibus está: situação em uma frase, as condições ambientais em tabela e "Neste trecho" (confirmações ou chamado daquele lugar). |
| `2` | **Chamados** | Tabela dos problemas em confirmação (1 de 3, 2 de 3) e tabela de chamados com protocolo, situação e ações. A aba mostra quantos estão abertos. |
| `3` | **Registro** | Tudo o que chegou, em tabela, com filtros: Tudo, Problemas, Chamados, Conexão. |
| `4` | **Cidadão** | O app do cidadão em tamanho legível e a dica atual em letras grandes, com a origem. |

Em qualquer tela, o cabeçalho mostra a conexão numa frase. Quando o sinal cai, **esse é o alerta**
("Sem sinal há 18 s · leituras guardadas no ônibus", em vermelho), e o ônibus fica acinzentado no mapa.
Novidades (novo chamado, leituras recebidas após reconexão) aparecem como **notificação compacta**
no canto inferior esquerdo. Modos, gravação e zerar ficam no menu **⋯**.

No percurso, o estado de cada trecho muda a cor **e a espessura** do traço (fino = normal,
médio = atenção, grosso = crítico, pontilhado = sem dados), e só os trechos com problema ganham
uma segunda linha de texto. Tipografia: IBM Plex Sans para texto e IBM Plex Mono para dados.

## Como rodar localmente

**Jeito mais simples:** dê dois cliques em `index.html`. Abre no navegador e funciona.

**Jeito recomendado** (igual ao site publicado), com um servidor local:

```bash
cd pulso
python3 -m http.server 8000
# abra http://localhost:8000
```

(ou `npx serve .`, se preferir Node)

Use Chrome ou Edge atualizados. Para gravar, aperte `F` (tela cheia) e depois `G` (modo gravação).

## Como publicar online de graça

**Opção A: Netlify Drop (2 minutos, sem conta de Git)**
1. Acesse https://app.netlify.com/drop
2. Arraste a pasta `pulso` inteira para a página.
3. Pronto: você recebe um link `https://….netlify.app`. Para atualizar, arraste de novo.

**Opção B: GitHub Pages (bom para a equipe toda editar)**
1. Crie um repositório no GitHub e envie esta pasta (`index.html` na raiz).
2. No repositório: *Settings → Pages → Source: Deploy from a branch → main / (root)*.
3. Em 1 ou 2 minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

O site publicado é HTTPS e conecta no broker por `wss://`, que é o que os navegadores exigem.

## Modos e atalhos

| Tecla | O que faz |
|---|---|
| `1` `2` `3` `4` | Telas: Linha, Chamados, Registro, Cidadão |
| `L` | Modo **ao vivo**: dados reais do ESP32 pelo MQTT |
| `D` | Modo **demonstração**: volta simulada, mesmo formato do ESP32 |
| `G` | Liga/desliga o **modo gravação** (esconde botões, menus e cursor) |
| `Z` `Z` | **Zerar tudo** (duas vezes seguidas, para evitar acidente) |
| `A` | Avança o chamado mais recente: aberto → em atendimento → resolvido |
| `Espaço` | Pausa/continua a demonstração |
| `+` / `-` | Acelera/desacelera a demonstração |
| `S` | Liga/desliga o som |
| `F` | Tela cheia |
| `H` | Mostra os atalhos |

Endereços úteis: `index.html?modo=aovivo`, `index.html?vista=chamados`, `index.html?modo=demo&gravacao=1`, `index.html?velocidade=2`.
Sem parâmetro, a página abre no último modo usado (na primeira vez, no demo).

**Som:** navegadores só tocam som depois que alguém aperta uma tecla ou clica na página.
Antes de gravar, aperte qualquer atalho (por exemplo `G`).

**Salvamento:** no modo ao vivo, chamados, histórico e confirmações ficam salvos no navegador
(localStorage) e continuam lá ao recarregar. O modo demonstração sempre recomeça do zero.

## Roteiro do modo demonstração (cerca de 2 minutos)

Com 6 s por trecho (ajustável em `config.js`):

| Tempo | O que acontece |
|---|---|
| 0:00–0:36 | Volta 1: problemas aparecem no mapa (T02 escuro, T03 quente, T04 buraco, T05 ar ruim); confirmações 1/3 |
| ~0:49 | Volta 2: o sinal cai no T03; o ônibus fica cinza com "sem sinal" |
| ~1:04 | Passa de 15 s sem status: "Dispositivo offline" |
| ~1:13 | O sinal volta: o buffer é enviado e aparece "4 leituras recebidas após reconexão" |
| ~1:24 | Volta 3: nasce o chamado **Poste apagado** (T02), com aviso e som |
| ~1:36 | Nasce o chamado **Buraco** (T04) |
| ~1:42 | Falha de sensor por alguns segundos (termômetro sem leitura) |

Depois disso o ônibus continua dando voltas.

## Testar o modo ao vivo sem a maquete

Abra `testar-mqtt.html`. Ela faz o papel do ESP32 e publica no broker real:
- **Roteiro completo:** o mesmo da demonstração, mas passando pela internet.
- **Mensagem escrita à mão:** cole ou edite um JSON e publique em `leituras` ou `status`.

Deixe o painel (`index.html`, tecla `L`) aberto em outra aba ou outro computador.

## O que editar (config.js)

- `trechos`: nome da rua de cada trecho, rua paralela (usada na dica do cidadão) e cenário da maquete.
- `mqtt`: endereço do broker e os dois tópicos.
- `segundosParaOffline`: limite sem status para considerar offline (15 s).
- `confirmacoesParaChamado` e `chamados`: quantas passagens abrem um chamado e de quais camadas.
- `dicasCidadao`: frases mostradas no celular.
- `demo`: velocidade e roteiro da demonstração.

## Estrutura

```
docs/CONECTAR-ESP32.md   guia para ligar o ESP32 ao painel
esp32/pulso_mqtt/        firmware do ESP32 + montagem do Wokwi (diagram.json, libraries.txt)
index.html           painel (a tela que vai para o vídeo)
testar-mqtt.html     simulador que publica no broker real
config.js            configurações (o arquivo que a equipe mais edita)
css/estilo.css       visual
js/estado.js         estado central, eventos e funções de apoio
js/processador.js    recebe as mensagens; confirmações, chamados, linha do tempo, online/offline
js/simulador.js      ESP32 simulado (demo e testar-mqtt)
js/conexao.js        conexão MQTT
js/mapa.js           pista em anel, rótulos dos trechos e ônibus animado
js/paineis.js        topo, painel do trecho atual, telas Chamados e Registro, faixas de aviso
js/cidadao.js        tela Cidadão (celular + dica em destaque)
js/som.js            som curto do chamado
js/app.js            modos, atalhos e inicialização
vendor/mqtt.min.js   biblioteca MQTT (mqtt.js 5.10.1, licença MIT)
```

## Regras que o painel segue

- **Quem classifica é o ESP32.** O painel só exibe NORMAL / ATENCAO / CRITICO / "---" como recebeu.
  A única conta é escolher o *pior* estado de um trecho para pintar o mapa.
- **Confirmações:** cada passagem (campo `passagem`) com a camada em CRITICO conta 1, sem contar a mesma
  passagem duas vezes. Uma passagem NORMAL zera a contagem (o problema sumiu). ATENCAO e "---" não mudam nada.
  Na 3ª, nasce o chamado. Não abre outro igual (mesmo trecho e tipo) enquanto houver um não resolvido.
  Ao marcar como resolvido, a contagem recomeça.
- **Trecho atual:** os números vêm do tópico `status` (ao vivo). O estado de cada camada vem da última
  `leitura` daquele trecho, porque o `status` só traz o estado geral.
- **Ônibus:** anda para o trecho seguinte quando chega uma leitura nova. Leituras atrasadas
  (`enviado_offline: true`) pintam o mapa mas não movem o ônibus.
- **Offline:** mais de 15 s sem nenhuma mensagem do dispositivo.
- Números `null` aparecem como "—"; `geral: "FALHA"` ou `falha_sensor: true` aparecem como "Falha de sensor".
