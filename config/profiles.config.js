/*
  Manual profile list.

  What the official Discord HTTP API can reliably provide through documented routes:
  - username
  - global_name (display name)
  - avatar
  - banner
  - accent_color

  This version intentionally does not render badges or bio.
  Social links are manual and rendered directly inside each card.
  Live presence is enriched automatically through Lanyard when available.
  If a user is not tracked by Lanyard, the card simply shows no live status block.
  Supported platforms in the frontend:
  - discord
  - instagram
  - x
  - github
  - spotify
  - twitch
  - youtube
  - tiktok
  - steam
  - website

  guildId is optional. When informed, the backend will also try the official
  GET /guilds/{guild.id}/members/{user.id} route to read server nickname and
  guild-specific avatar/banner when they exist.
*/

module.exports = [
  {
    key: "owner",
    spotlightLabel: "Owner",
    discordUserId: "1450645504596639757",
    guildId: "",
    cardTheme: "black",
    accentColor: "#8ce9ff",
    socials: [
      { platform: "discord", url: "https://discord.com/users/1450645504596639757" },
      { platform: "instagram", url: "https://instagram.com/jvws_" }
    ],
    fallback: {
      username: "seu_usuario",
      displayName: "Seu nome",
      note: "Seu ID real ja foi configurado. Agora basta adicionar o token do bot no arquivo .env."
    }
  },
  {
    key: "friend",
    spotlightLabel: "Co-Owner",
    discordUserId: "1339011161433051198",
    guildId: "",
    cardTheme: "black",
    accentColor: "#ffbf7a",
    socials: [
      { platform: "discord", url: "https://discord.com/users/1339011161433051198" },
      { platform: "instagram", url: "https://instagram.com/macetagov" }
    ],
    fallback: {
      username: "amigo_usuario",
      displayName: "Nome do amigo",
      note: "Se quiser apelido de servidor ou avatar especifico do servidor, informe tambem guildId."
    }
  }
];
