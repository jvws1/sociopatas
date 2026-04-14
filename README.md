# Discord Profile Showcase (Guns.lol Inspired)

Single page para exibir perfis do Discord em estilo moderno inspirado no **guns.lol**, com presença em tempo real (Spotify, status, atividade).

* frontend em HTML, CSS e JavaScript puro (sem framework)
* backend em Node.js para consumir a API do Discord com segurança
* renderização dinâmica de perfis
* suporte a Rich Presence (Spotify + atividades)
* fallback manual para dados que a API não fornece

---

## ✨ Features

* 🎧 Spotify em tempo real
* 🟢 Status do Discord (online, idle, dnd, offline)
* 🧠 Custom Status (emoji + texto)
* 🎮 Atividade atual (jogos, streaming, etc.)
* 🖼️ Banner e avatar dinâmicos
* 🎨 Accent color automático baseado na imagem
* 🔊 Música de fundo opcional
* 🎬 Vídeo de fundo opcional
* ⚡ Atualização automática dos perfis

---

## 📁 Estrutura

```text
public/
  index.html
  style.css
  script.js

config/
  profiles.config.js

server/
  server.js

.env
.env.example
package.json
README.md
```

---

## 🔌 Integração com Discord

O backend utiliza a API oficial do Discord:

### Rotas utilizadas:

* `GET /users/{id}`

  * username
  * global_name
  * avatar
  * banner
  * accent_color

* `GET /guilds/{guild.id}/members/{user.id}` *(opcional)*

  * nickname do servidor
  * avatar/banner específico do servidor

---

## 🎧 Spotify / Rich Presence

Se o usuário estiver ouvindo música no Spotify, o sistema exibe:

* capa do álbum
* nome da música
* artista
* link para o Spotify
* barra de progresso em tempo real
* tempo atual e duração total

### ⚠️ Importante

A barra de progresso só aparece se o backend fornecer:

```js
spotify.timestamps = {
  start: number (timestamp em ms),
  end: number (timestamp em ms)
}
```

Se isso não vier, o card aparece **sem barra**.

---

## 🧾 Dados que NÃO vêm da API (fallback manual)

A API pública do Discord **não fornece**:

* bio / about me

Por isso usamos fallback:

```js
fallback: {
  bio: "Texto manual aqui"
}
```

---

## ⚙️ Configuração

### 1. Instalar dependências

```bash
npm install
```

---

### 2. Configurar `.env`

```env
PORT=3000
DISCORD_BOT_TOKEN=seu_token_aqui
CACHE_TTL_MS=60000
```

---

### 3. Configurar perfis

Edite:

```text
config/profiles.config.js
```

Exemplo:

```js
{
  discordUserId: "123456789",
  guildId: "987654321", // opcional
  fallback: {
    bio: "Minha bio aqui"
  }
}
```

---

## 🚀 Como rodar

```bash
npm start
```

Acesse:

```text
http://localhost:3000
```

---

## 🔄 Atualização automática

Os perfis são atualizados automaticamente a cada:

```js
PRESENCE_REFRESH_MS = 30000 // 30 segundos
```

---

## ⚠️ Observações importantes

* ❌ Não possui painel admin

* ❌ Não possui autenticação/login

* ❌ Não edita perfis dinamicamente

* ✅ Perfis são definidos manualmente

* ✅ Token do bot nunca vai para o frontend

* ✅ Sistema resiliente com fallback

---

## 🧠 Limitações da API do Discord

A API pública:

* ❌ Não fornece bio
* ❌ Não fornece dados completos de presença sem gateway
* ❌ Não garante Spotify sempre disponível

---

## 🎨 Inspiração

Este projeto é uma implementação inspirada em:

* guns.lol

Com foco em:

* performance
* visual moderno
* simplicidade (sem framework)

---

## 🛠️ Stack

* Node.js
* Express
* Vanilla JS
* CSS moderno (sem framework)
