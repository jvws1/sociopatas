const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const serverless = require("serverless-http");

const ROOT_DIR = path.join(__dirname, "..", "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config", "profiles.config.js");
const SITE_CONFIG_PATH = path.join(ROOT_DIR, "config", "site.config.js");
const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_CDN_BASE = "https://cdn.discordapp.com";
const LANYARD_API_BASE = "https://api.lanyard.rest/v1/users";
const DEFAULT_ACCENTS = ["#8ce9ff", "#ffbf7a", "#8ff7c6", "#ff8fbd", "#9eb4ff", "#9be7ff"];
const ALLOWED_SOCIAL_PLATFORMS = new Set([
  "discord",
  "instagram",
  "x",
  "github",
  "spotify",
  "twitch",
  "youtube",
  "tiktok",
  "steam",
  "website"
]);

if (typeof fetch !== "function") {
  throw new Error("Node 18+ is required because this project uses the native fetch API.");
}

const app = express();
const cacheTtlMs = Math.max(Number(process.env.CACHE_TTL_MS || 60000), 0);
const profileCache = {
  expiresAt: 0,
  payload: null,
  configStamp: 0
};

app.get("/api/profiles", async (_request, response) => {
  try {
    const payload = await getProfilesPayload();
    response.json(payload);
  } catch (error) {
    console.error("Failed to build profile payload:", error);

    response.status(500).json({
      error: "Failed to build the Discord profile payload.",
      details: error.message
    });
  }
});

module.exports.handler = serverless(app);

async function getProfilesPayload() {
  const configStamp = getConfigStamp();

  if (
    profileCache.payload &&
    profileCache.expiresAt > Date.now() &&
    profileCache.configStamp === configStamp
  ) {
    return profileCache.payload;
  }

  const configuredProfiles = loadProfilesConfig();
  const site = loadSiteConfig();
  const profiles = await Promise.all(
    configuredProfiles.map((profileConfig, index) => buildProfile(profileConfig, index))
  );

  const tokenConfigured = Boolean(getDiscordBotToken());
  const payload = {
    meta: {
      tokenConfigured,
      profileCount: profiles.length,
      cacheTtlMs,
      fetchedAt: new Date().toISOString(),
      sourceSummary: tokenConfigured
        ? "Official data is enabled. Avatar, username, display name and banner come from Discord when available."
        : "DISCORD_BOT_TOKEN is missing, so the page is rendering only configured fallback data.",
      limitationNote:
        "This version focuses on avatar, username, display name and banner. Missing banners fall back to the visual gradient."
    },
    site,
    profiles
  };

  profileCache.payload = payload;
  profileCache.expiresAt = Date.now() + cacheTtlMs;
  profileCache.configStamp = configStamp;

  return payload;
}

function loadProfilesConfig() {
  const resolvedPath = require.resolve(CONFIG_PATH);
  delete require.cache[resolvedPath];

  const loadedConfig = require(resolvedPath);

  if (!Array.isArray(loadedConfig)) {
    throw new Error("config/profiles.config.js must export an array.");
  }

  return loadedConfig.filter((entry) => entry && entry.enabled !== false);
}

function loadSiteConfig() {
  try {
    const resolvedPath = require.resolve(SITE_CONFIG_PATH);
    delete require.cache[resolvedPath];
    const loadedConfig = require(resolvedPath);

    return {
      intro: sanitizeIntroConfig(loadedConfig.intro),
      backgroundVideo: sanitizeBackgroundVideoConfig(loadedConfig.backgroundVideo),
      music: sanitizeMusicConfig(loadedConfig.music)
    };
  } catch {
    return {
      intro: sanitizeIntroConfig({}),
      backgroundVideo: sanitizeBackgroundVideoConfig({ enabled: false }),
      music: sanitizeMusicConfig({ enabled: false })
    };
  }
}

async function buildProfile(profileConfig, index) {
  const fallback = isPlainObject(profileConfig.fallback) ? profileConfig.fallback : {};
  const userId = String(profileConfig.discordUserId || "").trim();
  const guildId = String(profileConfig.guildId || "").trim();
  const token = getDiscordBotToken();

  let user = null;
  let guildMember = null;
  let lanyardPresence = null;

  const notes = [];
  const accentColor = normalizeHexColor(profileConfig.accentColor) || DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length];

  if (!isSnowflake(userId)) {
    notes.push("discordUserId is missing or invalid in config/profiles.config.js, so this card is using only local fallback data.");
  } else if (!token) {
    notes.push("DISCORD_BOT_TOKEN is not configured, so official Discord data is disabled and fallback content is being shown.");
  } else {
    try {
      user = await fetchDiscordJson(`/users/${userId}`);
    } catch (error) {
      notes.push(describeDiscordError(error, "user"));
    }

    if (user && isSnowflake(guildId)) {
      try {
        guildMember = await fetchDiscordJson(`/guilds/${guildId}/members/${userId}`);
      } catch (error) {
        notes.push(describeDiscordError(error, "member"));
      }
    }
  }

  if (isSnowflake(userId)) {
    try {
      lanyardPresence = await fetchLanyardPresence(userId);
    } catch (error) {
      notes.push(describeLanyardError(error));
    }
  }

  const officialAccentColor = normalizeHexColor(
    integerColorToHex(user && typeof user.accent_color === "number" ? user.accent_color : null)
  );
  const resolvedAccent = officialAccentColor || accentColor;

  const displayName =
    user?.global_name || guildMember?.nick || user?.username || fallback.displayName || null;
  const avatarUrl = resolveAvatarUrl(user, guildMember, guildId);
  const bannerUrl = resolveBannerUrl(user, guildMember, guildId);
  const dataPoints = buildDataPoints({
    avatarUrl,
    bannerUrl,
    displayName,
    guildMember
  });

  if (!bannerUrl) {
    notes.push("No banner was available for this profile, so the frontend should render a visual gradient fallback.");
  }

  return {
    key: profileConfig.key || `profile-${index + 1}`,
    spotlightLabel:
      typeof profileConfig.spotlightLabel === "string"
        ? profileConfig.spotlightLabel.trim()
        : `Profile ${index + 1}`,
    discordUserId: userId,
    username: user?.username || fallback.username || `profile_${index + 1}`,
    displayName,
    serverNickname:
      guildMember?.nick && guildMember.nick !== displayName ? guildMember.nick : null,
    avatarUrl,
    bannerUrl,
    accentColor: resolvedAccent,
    hasOfficialAccentColor: Boolean(officialAccentColor),
    cardTheme: profileConfig.cardTheme === "black" ? "black" : "default",
    presence: mapLanyardPresence(lanyardPresence),
    socials: sanitizeSocials(profileConfig.socials),
    sourceState: user ? "official-partial" : "config-only",
    sourceLabel: user ? "Official Discord API" : "Manual fallback only",
    primaryGuildTag: user?.primary_guild?.tag || null,
    note: fallback.note || null,
    notes: uniqueStrings(notes).slice(0, 3),
    dataPoints
  };
}

async function fetchDiscordJson(endpoint) {
  const token = getDiscordBotToken();

  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is missing.");
  }

  const response = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "discord-profile-showcase/1.0"
    }
  });

  if (!response.ok) {
    const body = await safeReadJson(response);
    const error = new Error(body?.message || `Discord API request failed with status ${response.status}.`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return response.json();
}

async function fetchLanyardPresence(userId) {
  const response = await fetch(`${LANYARD_API_BASE}/${userId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "discord-profile-showcase/1.0"
    }
  });

  if (!response.ok) {
    const error = new Error(`Lanyard request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return payload?.success && payload?.data ? payload.data : null;
}

function resolveAvatarUrl(user, guildMember, guildId) {
  if (guildMember?.avatar && isSnowflake(guildId) && user?.id) {
    return buildCdnUrl(`guilds/${guildId}/users/${user.id}/avatars`, guildMember.avatar, 512);
  }

  if (user?.avatar && user?.id) {
    return buildCdnUrl(`avatars/${user.id}`, user.avatar, 512);
  }

  if (user?.id) {
    return buildDefaultAvatarUrl(user.id, user.discriminator);
  }

  return null;
}

function resolveBannerUrl(user, guildMember, guildId) {
  if (guildMember?.banner && isSnowflake(guildId) && user?.id) {
    return buildCdnUrl(`guilds/${guildId}/users/${user.id}/banners`, guildMember.banner, 1024);
  }

  if (user?.banner && user?.id) {
    return buildCdnUrl(`banners/${user.id}`, user.banner, 1024);
  }

  return null;
}

function buildCdnUrl(pathPrefix, hash, size) {
  const extension = String(hash).startsWith("a_") ? "gif" : "png";
  return `${DISCORD_CDN_BASE}/${pathPrefix}/${hash}.${extension}?size=${size}`;
}

function buildDefaultAvatarUrl(userId, discriminator) {
  let avatarIndex = 0;

  if (discriminator && discriminator !== "0") {
    avatarIndex = Number(discriminator) % 5;
  } else {
    avatarIndex = Number((BigInt(userId) >> 22n) % 6n);
  }

  return `${DISCORD_CDN_BASE}/embed/avatars/${avatarIndex}.png`;
}

function buildDataPoints({ avatarUrl, bannerUrl, displayName, guildMember }) {
  return [
    avatarUrl ? "avatar ready" : "avatar fallback",
    bannerUrl ? "banner ready" : "banner gradient",
    displayName ? "display name ready" : "username only",
    guildMember?.nick ? "server nick ready" : "no server nick"
  ];
}

function describeDiscordError(error, scope) {
  if (error.status === 401 || error.status === 403) {
    return "The Discord token was rejected. Check DISCORD_BOT_TOKEN in your .env file.";
  }

  if (error.status === 404 && scope === "user") {
    return "No Discord user was found for the configured discordUserId.";
  }

  if (error.status === 404 && scope === "member") {
    return "guildId was provided, but the bot could not read guild member data for that user in that server.";
  }

  if (typeof error.status === "number") {
    return `Discord API returned status ${error.status} while loading ${scope} data.`;
  }

  return `Unexpected error while loading ${scope} data from Discord.`;
}

function describeLanyardError(error) {
  if (typeof error?.status === "number") {
    return `Lanyard returned status ${error.status} while loading live presence.`;
  }

  return "Lanyard live presence could not be loaded for this profile.";
}

function getDiscordBotToken() {
  return String(process.env.DISCORD_BOT_TOKEN || "").trim();
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function integerColorToHex(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return `#${value.toString(16).padStart(6, "0")}`;
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (/^#[\da-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSocials(socials) {
  if (!Array.isArray(socials)) {
    return [];
  }

  return socials
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const platform = String(entry.platform || "").trim().toLowerCase();
      const url = String(entry.url || "").trim();
      const label = String(entry.label || "").trim();

      if (!ALLOWED_SOCIAL_PLATFORMS.has(platform) || !isSafeUrl(url)) {
        return null;
      }

      return {
        platform,
        url,
        label: label || null
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeIntroConfig(intro) {
  if (!isPlainObject(intro)) {
    return {
      enabled: true,
      title: "enter",
      subtitle: "clique para entrar"
    };
  }

  return {
    enabled: intro.enabled !== false,
    title: String(intro.title || "enter").trim().slice(0, 80),
    subtitle: String(intro.subtitle || "clique para entrar").trim().slice(0, 140)
  };
}

function sanitizeMusicConfig(music) {
  if (!isPlainObject(music)) {
    return { enabled: false };
  }

  const src = String(music.src || "").trim();

  if (music.enabled === false || !isSafeAudioSource(src)) {
    return { enabled: false };
  }

  return {
    enabled: true,
    src,
    title: String(music.title || "Untitled track").trim().slice(0, 80),
    artist: String(music.artist || "").trim().slice(0, 80),
    loop: music.loop !== false,
    startMuted: Boolean(music.startMuted),
    requireInteraction: music.requireInteraction !== false,
    volume: clampNumber(music.volume, 0, 1, 0.55)
  };
}

function sanitizeBackgroundVideoConfig(backgroundVideo) {
  if (!isPlainObject(backgroundVideo)) {
    return { enabled: false };
  }

  const src = String(backgroundVideo.src || "").trim();

  if (backgroundVideo.enabled === false || !isSafeVideoSource(src)) {
    return { enabled: false };
  }

  return {
    enabled: true,
    src,
    overlayOpacity: clampNumber(backgroundVideo.overlayOpacity, 0, 1, 0.48)
  };
}

function mapLanyardPresence(presence) {
  if (!isPlainObject(presence)) {
    return null;
  }

  const customStatus = resolveCustomStatus(presence.activities);
  const activity = resolvePrimaryActivity(presence.activities);
  const spotify = resolveSpotifyPresence(presence);
  const status = normalizeLanyardStatus(presence.discord_status);

  if (!status && !activity && !spotify && !customStatus) {
    return null;
  }

  return {
    status,
    onDesktop: Boolean(presence.active_on_discord_desktop),
    onMobile: Boolean(presence.active_on_discord_mobile),
    onWeb: Boolean(presence.active_on_discord_web),
    customStatus,
    activity,
    spotify
  };
}

function resolvePrimaryActivity(activities) {
  if (!Array.isArray(activities)) {
    return null;
  }

  const preferredActivity = activities.find((activity) => isRenderableActivity(activity));

  if (!preferredActivity) {
    return null;
  }

  return {
    type: preferredActivity.type,
    name: String(preferredActivity.name || "").trim(),
    details: String(preferredActivity.details || "").trim() || null,
    state: String(preferredActivity.state || "").trim() || null,
    startedAt:
      typeof preferredActivity.timestamps?.start === "number"
        ? preferredActivity.timestamps.start
        : null,
    endedAt:
      typeof preferredActivity.timestamps?.end === "number"
        ? preferredActivity.timestamps.end
        : null
  };
}

function resolveCustomStatus(activities) {
  if (!Array.isArray(activities)) {
    return null;
  }

  const customActivity = activities.find(
    (activity) =>
      isPlainObject(activity) &&
      activity.type === 4 &&
      String(activity.state || "").trim()
  );

  if (!customActivity) {
    return null;
  }

  return {
    text: String(customActivity.state || "").trim(),
    emoji: resolveActivityEmoji(customActivity.emoji)
  };
}

function resolveSpotifyPresence(presence) {
  if (!presence.listening_to_spotify || !isPlainObject(presence.spotify)) {
    return null;
  }

  const spotify = presence.spotify;
  const trackId = String(spotify.track_id || "").trim();

  return {
    song: String(spotify.song || "").trim() || "Unknown track",
    artist: String(spotify.artist || "").trim() || "Unknown artist",
    album: String(spotify.album || "").trim() || null,
    albumArtUrl: String(spotify.album_art_url || "").trim() || null,
    trackUrl: trackId ? `https://open.spotify.com/track/${trackId}` : null,
    timestamps: {
      start: typeof spotify.timestamps?.start === "number" ? spotify.timestamps.start : null,
      end: typeof spotify.timestamps?.end === "number" ? spotify.timestamps.end : null
    }
  };
}

function isRenderableActivity(activity) {
  return (
    isPlainObject(activity) &&
    String(activity.name || "").trim() &&
    String(activity.name || "").trim().toLowerCase() !== "spotify" &&
    activity.type !== 4
  );
}

function resolveActivityEmoji(emoji) {
  if (!isPlainObject(emoji)) {
    return null;
  }

  if (typeof emoji.name === "string" && emoji.name.trim()) {
    return emoji.name.trim();
  }

  return null;
}

function normalizeLanyardStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (!["online", "idle", "dnd", "offline"].includes(normalized)) {
    return null;
  }

  return normalized;
}

function isSafeUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeAudioSource(value) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  return isSafeUrl(value);
}

function isSafeVideoSource(value) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  return isSafeUrl(value);
}

function getConfigStamp() {
  return [CONFIG_PATH, SITE_CONFIG_PATH].reduce((latestStamp, currentPath) => {
    try {
      return Math.max(latestStamp, fs.statSync(currentPath).mtimeMs);
    } catch {
      return latestStamp;
    }
  }, 0);
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}