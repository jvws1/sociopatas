const profilesGrid = document.getElementById("profiles-grid");
const backgroundVideoShell = document.getElementById("background-video-shell");
const backgroundVideo = document.getElementById("background-video");
const backgroundVideoOverlay = document.getElementById("background-video-overlay");
const enterOverlay = document.getElementById("enter-overlay");
const enterButton = document.getElementById("enter-button");
const enterTitle = document.getElementById("enter-title");
const enterSubtitle = document.getElementById("enter-subtitle");
const musicDock = document.getElementById("music-dock");
const musicMute = document.getElementById("music-mute");
const musicMuteIcon = document.getElementById("music-mute-icon");
const musicVolume = document.getElementById("music-volume");
const siteAudio = document.getElementById("site-audio");
const PRESENCE_REFRESH_MS = 30000;

let musicState = {
  enabled: false,
  requireInteraction: true,
  autoplayBlocked: false
};

let siteInitialized = false;
let refreshTimerId = null;

/**
 * Timers ativos do Spotify.
 * Guardamos aqui para conseguir limpar tudo antes de re-renderizar os cards.
 */
const spotifyTimers = new Set();

document.addEventListener("DOMContentLoaded", () => {
  renderLoadingCards(2);
  loadProfiles({ initial: true });
});

async function loadProfiles({ initial = false } = {}) {
  try {
    const response = await fetch("/api/profiles", {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.details || payload.error || "Failed to load profiles.");
    }

    renderMeta(payload.meta);

    if (initial) {
      await setupSiteChrome(payload.site);
      startPresenceRefresh();
    }

    renderProfiles(payload.profiles || []);
  } catch (error) {
    renderErrorState(error);
  } finally {
    profilesGrid.setAttribute("aria-busy", "false");
  }
}

async function setupSiteChrome(site) {
  if (siteInitialized) {
    return;
  }

  setupBackgroundVideo(site);
  await setupSiteMusic(site);
  siteInitialized = true;
}

function setupBackgroundVideo(site) {
  const video = site?.backgroundVideo || {};
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!video.enabled || !video.src) {
    backgroundVideo.pause();
    backgroundVideo.removeAttribute("src");
    backgroundVideo.load();
    backgroundVideoShell.classList.add("is-hidden");
    return;
  }

  let videoSrc = video.src;

  // No celular, usa a versão mais leve em 720p
  if (isMobile) {
    videoSrc = "/media/15439239_1280_720_24fps.mp4";
  }

  // Se o usuário prefere menos movimento, ainda mantém o vídeo,
  // mas você pode trocar por uma versão ainda mais leve se quiser.
  if (prefersReducedMotion) {
    videoSrc = isMobile
      ? "/media/15439239_1280_720_24fps.mp4"
      : video.src;
  }

  backgroundVideo.src = normalizeMediaSrc(videoSrc);
  backgroundVideo.load();
  backgroundVideoShell.classList.remove("is-hidden");

  backgroundVideoOverlay.style.setProperty(
    "--video-overlay-opacity",
    String(typeof video.overlayOpacity === "number" ? video.overlayOpacity : 0.48)
  );
}

function renderMeta(meta) {
  return meta;
}

async function setupSiteMusic(site) {
  const intro = site?.intro || {};
  const music = site?.music || {};

  if (!music.enabled || !music.src) {
    musicState = {
      enabled: false,
      requireInteraction: true,
      autoplayBlocked: false
    };
    document.body.classList.remove("intro-active");
    document.body.classList.add("intro-complete");
    enterOverlay.classList.add("is-hidden");
    musicDock.classList.add("is-hidden");
    return;
  }

  musicState = {
    enabled: true,
    requireInteraction: music.requireInteraction !== false,
    autoplayBlocked: false
  };

  siteAudio.src = normalizeMediaSrc(music.src);
  siteAudio.loop = music.loop !== false;
  siteAudio.volume = typeof music.volume === "number" ? music.volume : 0.55;
  siteAudio.muted = Boolean(music.startMuted);
  siteAudio.load();

  musicDock.classList.remove("is-hidden");
  musicVolume.value = String(Math.round(siteAudio.volume * 100));
  syncMusicControls();

  musicMute.onclick = () => {
    siteAudio.muted = !siteAudio.muted;
    syncMusicControls();
  };

  musicVolume.oninput = (event) => {
    const nextVolume = Number(event.currentTarget.value) / 100;
    siteAudio.volume = clamp(nextVolume, 0, 1);
    if (siteAudio.volume > 0 && siteAudio.muted) {
      siteAudio.muted = false;
    }
    syncMusicControls();
  };

  siteAudio.addEventListener("play", syncMusicControls);
  siteAudio.addEventListener("pause", syncMusicControls);
  siteAudio.addEventListener("volumechange", syncMusicControls);
  siteAudio.addEventListener("ended", syncMusicControls);

  if (musicState.requireInteraction) {
    document.body.classList.add("intro-active");
    document.body.classList.remove("intro-complete");
    enterTitle.textContent = intro.title || "enter";
    enterSubtitle.textContent = intro.subtitle || "";
    enterOverlay.classList.remove("is-hidden");
    enterOverlay.setAttribute("aria-hidden", "false");

    await tryAutoplayOnIntro();

    enterButton.onclick = async () => {
      siteAudio.muted = false;
      await playSiteAudio();
      closeEnterOverlay();
    };
  } else {
    document.body.classList.remove("intro-active");
    document.body.classList.add("intro-complete");
    enterOverlay.classList.add("is-hidden");
    enterOverlay.setAttribute("aria-hidden", "true");
    playSiteAudio();
  }
}

async function playSiteAudio() {
  try {
    await siteAudio.play();
    musicState.autoplayBlocked = false;
    syncMusicControls();
  } catch {
    syncMusicControls();
  }
}

async function tryAutoplayOnIntro() {
  try {
    await siteAudio.play();
    musicState.autoplayBlocked = false;
    syncMusicControls();
  } catch {
    musicState.autoplayBlocked = true;
    enterSubtitle.textContent = "";
    syncMusicControls();
  }
}

function closeEnterOverlay() {
  enterOverlay.classList.add("is-leaving");
  window.setTimeout(() => {
    enterOverlay.classList.add("is-hidden");
    enterOverlay.classList.remove("is-leaving");
    enterOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("intro-active");
    document.body.classList.remove("intro-complete");
    void document.body.offsetWidth;
    window.requestAnimationFrame(() => {
      document.body.classList.add("intro-complete");
    });
  }, 900);
}

function syncMusicControls() {
  const isPlaying = !siteAudio.paused;
  const effectiveVolume = siteAudio.muted ? 0 : siteAudio.volume;

  musicDock.classList.toggle("is-playing", isPlaying);
  musicDock.classList.toggle("is-muted", effectiveVolume === 0);
  musicMute.setAttribute(
    "aria-label",
    effectiveVolume === 0 ? "Ativar som" : "Mutar musica"
  );
  musicVolume.value = String(Math.round(siteAudio.volume * 100));
  musicMuteIcon.innerHTML = getVolumeIconMarkup(effectiveVolume);
}

function normalizeMediaSrc(src) {
  if (typeof src !== "string") {
    return "";
  }

  if (src.startsWith("/")) {
    return encodeURI(src);
  }

  try {
    return new URL(src).toString();
  } catch {
    return src;
  }
}

function startPresenceRefresh() {
  if (refreshTimerId !== null) {
    window.clearInterval(refreshTimerId);
  }

  refreshTimerId = window.setInterval(() => {
    loadProfiles();
  }, PRESENCE_REFRESH_MS);
}

function clearAllSpotifyTimers() {
  for (const timerId of spotifyTimers) {
    window.clearTimeout(timerId);
  }
  spotifyTimers.clear();
}

function renderProfiles(profiles) {
  /**
   * Antes de recriar os cards,
   * limpamos todos os timers do Spotify ainda ativos.
   */
  clearAllSpotifyTimers();

  profilesGrid.innerHTML = "";

  if (!profiles.length) {
    const emptyState = document.createElement("article");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
      <h3>Nenhum perfil habilitado.</h3>
      <p>
        Edite <code>config/profiles.config.js</code> e deixe pelo menos dois itens
        ativos para renderizar os cards desta pagina.
      </p>
    `;
    profilesGrid.append(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();

  profiles.forEach((profile) => {
    fragment.append(createProfileCard(profile));
  });

  profilesGrid.append(fragment);
}

function createProfileCard(profile) {
  const article = document.createElement("article");
  article.className = "profile-card";

  if (profile.key === "owner") {
    article.classList.add("profile-card--owner");
  }

  const accent = isHexColor(profile.accentColor) ? profile.accentColor : "#8CE9FF";
  const usesBlackTheme = profile.cardTheme === "black";

  if (usesBlackTheme) {
    article.classList.add("profile-card--black-theme");
    applyBlackTheme(article);
  } else {
    applyAccentTheme(article, accent);
  }

  const surface = document.createElement("div");
  surface.className = "profile-card-surface";

  const hasBanner = Boolean(profile.bannerUrl);
  let bannerImage = null;
  let avatarImage = null;

  if (!hasBanner) {
    article.classList.add("profile-card--no-banner");
    surface.classList.add("profile-card-surface--no-banner");
  }

  const topline = document.createElement("div");
  topline.className = "profile-topline";

  if (profile.spotlightLabel) {
    const spotlight = document.createElement("span");
    spotlight.className = "profile-status";
    spotlight.textContent = profile.spotlightLabel;
    topline.append(spotlight);
  }

  if (hasBanner) {
    const banner = document.createElement("div");
    banner.className = "profile-banner";

    bannerImage = document.createElement("img");
    bannerImage.className = "profile-banner-image";
    bannerImage.src = profile.bannerUrl;
    bannerImage.alt = `Banner de ${profile.displayName || profile.username}`;
    bannerImage.loading = "lazy";
    bannerImage.referrerPolicy = "no-referrer";
    bannerImage.crossOrigin = "anonymous";

    banner.append(bannerImage);
    banner.append(topline);
    surface.append(banner);
  } else {
    surface.append(topline);
  }

  const body = document.createElement("div");
  body.className = "profile-body";

  const identityRow = document.createElement("div");
  identityRow.className = "identity-row";

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "avatar-wrap";

  const avatarShell = document.createElement("div");
  avatarShell.className = "avatar-shell";

  if (profile.avatarUrl) {
    avatarImage = document.createElement("img");
    avatarImage.className = "profile-avatar";
    avatarImage.src = profile.avatarUrl;
    avatarImage.alt = `Avatar de ${profile.displayName || profile.username}`;
    avatarImage.loading = "lazy";
    avatarImage.referrerPolicy = "no-referrer";
    avatarImage.crossOrigin = "anonymous";

    avatarImage.addEventListener("error", () => {
      avatarShell.replaceChildren(createAvatarFallback(profile));
    });

    avatarShell.append(avatarImage);
  } else {
    avatarShell.append(createAvatarFallback(profile));
  }

  avatarWrap.append(avatarShell);

  // --- INJEÇÃO DA BOLINHA DE STATUS DO DISCORD ---
  if (profile.presence?.status) {
    const dot = document.createElement("span");
    dot.className = `presence-dot is-${profile.presence.status} discord-style`;
    avatarWrap.append(dot);
  }

  identityRow.append(avatarWrap);

  if (profile.presence?.customStatus?.text) {
    identityRow.append(createCustomStatusBubble(profile.presence.customStatus));
  }

  const nameRow = document.createElement("div");
  nameRow.className = "profile-name-row";

  const profileName = document.createElement("h3");
  profileName.className = "profile-name";
  profileName.textContent = profile.displayName || profile.username;

  const username = document.createElement("p");
  username.className = "profile-username";
  username.textContent = `@${profile.username}`;

  nameRow.append(profileName, username);

  if (profile.serverNickname) {
    const nickname = document.createElement("p");
    nickname.className = "profile-nick";
    nickname.textContent = `Server nick: ${profile.serverNickname}`;
    nameRow.append(nickname);
  }

  const presenceBlock = createPresenceBlock(profile.presence);
  const socialsRow = createSocialsRow(profile.socials);

  body.append(identityRow, nameRow);

  if (presenceBlock) {
    body.append(presenceBlock);
  }

  if (socialsRow) {
    body.append(socialsRow);
  }

  surface.append(body);
  article.append(surface);

  if (!usesBlackTheme && !profile.hasOfficialAccentColor) {
    queueDerivedAccent(article, [bannerImage, avatarImage].filter(Boolean), accent);
  }

  return article;
}

function createAvatarFallback(profile) {
  const fallback = document.createElement("div");
  fallback.className = "profile-avatar-placeholder";
  fallback.textContent = getInitials(profile.displayName || profile.username || "DP");
  return fallback;
}

function applyAccentTheme(card, accent) {
  card.style.setProperty("--accent", accent);
  card.style.setProperty("--accent-soft", hexToRgba(accent, 0.2));
  card.style.setProperty("--accent-stroke", hexToRgba(accent, 0.4));
  card.style.setProperty("--accent-bg", hexToRgba(accent, 0.12));
}

function applyBlackTheme(card) {
  card.style.setProperty("--accent", "#0B0D12");
  card.style.setProperty("--accent-soft", "rgba(0, 0, 0, 0.24)");
  card.style.setProperty("--accent-stroke", "rgba(255, 255, 255, 0.1)");
  card.style.setProperty("--accent-bg", "rgba(255, 255, 255, 0.035)");
}

function queueDerivedAccent(card, images, fallbackAccent) {
  if (!images.length) {
    return;
  }

  let applied = false;

  const tryApplyFromImages = async () => {
    if (applied) {
      return;
    }

    for (const image of images) {
      const derivedAccent = await deriveAccentFromImage(image);
      if (derivedAccent) {
        applyAccentTheme(card, derivedAccent);
        applied = true;
        return;
      }
    }

    applyAccentTheme(card, fallbackAccent);
  };

  images.forEach((image) => {
    if (image.complete && image.naturalWidth > 0) {
      void tryApplyFromImages();
      return;
    }

    image.addEventListener("load", () => {
      void tryApplyFromImages();
    });
  });

  window.setTimeout(() => {
    void tryApplyFromImages();
  }, 900);
}

async function deriveAccentFromImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    return null;
  }

  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    try {
      await image.decode();
    } catch {
      return null;
    }
  }

  const width = 28;
  const height = Math.max(28, Math.round((image.naturalHeight / image.naturalWidth) * width));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;

  try {
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    let bestColor = null;
    let bestScore = 0;

    for (let index = 0; index < data.length; index += 16) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3] / 255;

      if (alpha < 0.65) {
        continue;
      }

      const { saturation, lightness } = rgbToHsl(red, green, blue);

      if (lightness < 0.16 || lightness > 0.82) {
        continue;
      }

      const score = saturation * 1.4 + lightness * 0.35 + alpha * 0.25;

      if (score > bestScore) {
        bestScore = score;
        bestColor = { red, green, blue };
      }
    }

    if (!bestColor) {
      return null;
    }

    return rgbToAccentHex(bestColor.red, bestColor.green, bestColor.blue);
  } catch {
    return null;
  }
}

function rgbToAccentHex(red, green, blue) {
  const hsl = rgbToHsl(red, green, blue);
  const boosted = hslToRgb(
    hsl.hue,
    clamp(hsl.saturation * 1.08 + 0.06, 0.24, 0.88),
    clamp(hsl.lightness < 0.32 ? 0.42 : hsl.lightness, 0.36, 0.62)
  );

  return `#${[boosted.red, boosted.green, boosted.blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));

    switch (max) {
      case r:
        hue = ((g - b) / delta) % 6;
        break;
      case g:
        hue = (b - r) / delta + 2;
        break;
      default:
        hue = (r - g) / delta + 4;
        break;
    }

    hue *= 60;

    if (hue < 0) {
      hue += 360;
    }
  }

  return { hue, saturation, lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let redPrime = 0;
  let greenPrime = 0;
  let bluePrime = 0;

  if (hue >= 0 && hue < 60) {
    redPrime = chroma;
    greenPrime = intermediate;
  } else if (hue < 120) {
    redPrime = intermediate;
    greenPrime = chroma;
  } else if (hue < 180) {
    greenPrime = chroma;
    bluePrime = intermediate;
  } else if (hue < 240) {
    greenPrime = intermediate;
    bluePrime = chroma;
  } else if (hue < 300) {
    redPrime = intermediate;
    bluePrime = chroma;
  } else {
    redPrime = chroma;
    bluePrime = intermediate;
  }

  return {
    red: Math.round((redPrime + match) * 255),
    green: Math.round((greenPrime + match) * 255),
    blue: Math.round((bluePrime + match) * 255)
  };
}

function createSocialsRow(socials) {
  if (!Array.isArray(socials) || !socials.length) {
    return null;
  }

  const row = document.createElement("div");
  row.className = "socials-row";

  socials.forEach((social) => {
    const iconMarkup = getSocialIcon(social.platform);

    if (!iconMarkup) {
      return;
    }

    const link = document.createElement("a");
    link.className = "social-link";
    link.href = social.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.setAttribute("aria-label", social.label || getSocialLabel(social.platform));
    link.setAttribute("title", social.label || getSocialLabel(social.platform));
    link.innerHTML = iconMarkup;

    if (social.platform === "discord") {
      link.addEventListener("click", (event) => {
        handleDiscordLinkClick(event, social.url);
      });
    }

    row.append(link);
  });

  return row.childElementCount ? row : null;
}

function createPresenceBlock(presence) {
  if (!presence) {
    return null;
  }

  const block = document.createElement("div");
  block.className = "presence-block";

  // Label de status removido para não duplicar com a bolinha do avatar

  if (presence.spotify) {
    block.append(createSpotifyPresence(presence.spotify));
  }

  if (presence.activity) {
    block.append(createActivityPresence(presence.activity));
  }

  return block.childElementCount ? block : null;
}

function createCustomStatusBubble(customStatus) {
  const bubble = document.createElement("div");
  bubble.className = "custom-status-bubble";

  const stem = document.createElement("span");
  stem.className = "custom-status-stem";

  const content = document.createElement("div");
  content.className = "custom-status-content";

  if (customStatus.emoji) {
    const emoji = document.createElement("span");
    emoji.className = "custom-status-emoji";
    emoji.textContent = customStatus.emoji;
    content.append(emoji);
  }

  const text = document.createElement("span");
  text.className = "custom-status-text";
  text.textContent = customStatus.text;

  content.append(text);
  bubble.append(stem, content);

  return bubble;
}

function createSpotifyPresence(spotify) {
  const tagName = spotify.trackUrl ? "a" : "div";
  const card = document.createElement(tagName);
  card.className = "presence-card presence-card--spotify";

  if (spotify.trackUrl) {
    card.href = spotify.trackUrl;
    card.target = "_blank";
    card.rel = "noreferrer noopener";
  }

  if (spotify.albumArtUrl) {
    const art = document.createElement("img");
    art.className = "presence-art";
    art.src = spotify.albumArtUrl;
    art.alt = spotify.album ? `Capa do album ${spotify.album}` : "Capa do album";
    art.loading = "lazy";
    art.referrerPolicy = "no-referrer";
    card.append(art);
  }

  const meta = document.createElement("div");
  meta.className = "presence-meta";

  const kicker = document.createElement("span");
  kicker.className = "presence-kicker";
  kicker.textContent = "Listening on Spotify";

  const song = document.createElement("strong");
  song.className = "presence-title";
  song.textContent = spotify.song;

  const artist = document.createElement("span");
  artist.className = "presence-subtitle";
  artist.textContent = spotify.artist;

  meta.append(kicker, song, artist);

  // --- PROGRESSO DO SPOTIFY REAL-TIME ---
  if (isValidSpotifyTimestamps(spotify.timestamps)) {
    const progressContainer = document.createElement("div");
    progressContainer.className = "spotify-progress-container";

    const totalDuration = spotify.timestamps.end - spotify.timestamps.start;
    const endStr = formatSpotifyTime(totalDuration);

    progressContainer.innerHTML = `
      <span class="spotify-time current-time">00:00</span>
      <div class="spotify-progress-bar">
        <div class="spotify-progress-fill"></div>
      </div>
      <span class="spotify-time total-time">${endStr}</span>
    `;

    meta.append(progressContainer);
    startSpotifyTimer(spotify.timestamps, progressContainer);
  }

  card.append(meta);
  return card;
}

function isValidSpotifyTimestamps(timestamps) {
  if (!timestamps || typeof timestamps !== "object") {
    return false;
  }

  const start = Number(timestamps.start);
  const end = Number(timestamps.end);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  if (end <= start) {
    return false;
  }

  return true;
}

function startSpotifyTimer(timestamps, container) {
  const fill = container.querySelector(".spotify-progress-fill");
  const currentText = container.querySelector(".current-time");

  const start = Number(timestamps?.start);
  const end = Number(timestamps?.end);
  const duration = end - start;

  if (!fill || !currentText) {
    return;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(duration) || duration <= 0) {
    currentText.textContent = "0:00";
    fill.style.width = "0%";
    return;
  }

  let timeoutId = null;

  const scheduleNext = (delay = 1000) => {
    timeoutId = window.setTimeout(update, delay);
    spotifyTimers.add(timeoutId);
  };

  const clearOwnTimer = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      spotifyTimers.delete(timeoutId);
      timeoutId = null;
    }
  };

  const update = () => {
    clearOwnTimer();

    if (!container.isConnected) {
      return;
    }

    const now = Date.now();
    const elapsed = clamp(now - start, 0, duration);
    const percentage = clamp((elapsed / duration) * 100, 0, 100);

    fill.style.width = `${percentage}%`;
    currentText.textContent = formatSpotifyTime(elapsed);

    if (elapsed < duration) {
      scheduleNext(1000);
    }
  };

  update();
}

function formatSpotifyTime(ms) {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function createActivityPresence(activity) {
  const card = document.createElement("div");
  card.className = "presence-card";

  const meta = document.createElement("div");
  meta.className = "presence-meta";

  const kicker = document.createElement("span");
  kicker.className = "presence-kicker";
  kicker.textContent = getActivityKicker(activity.type);

  const title = document.createElement("strong");
  title.className = "presence-title";
  title.textContent = activity.name;

  meta.append(kicker, title);

  if (activity.details || activity.state) {
    const subtitle = document.createElement("span");
    subtitle.className = "presence-subtitle";
    subtitle.textContent = [activity.details, activity.state].filter(Boolean).join(" • ");
    meta.append(subtitle);
  }

  const timing = formatActivityTiming(activity);

  if (timing) {
    const detail = document.createElement("span");
    detail.className = "presence-detail";
    detail.textContent = timing;
    meta.append(detail);
  }

  card.append(meta);
  return card;
}

function renderLoadingCards(count) {
  /**
   * Limpa timers antigos também quando renderiza loading,
   * para evitar timer órfão.
   */
  clearAllSpotifyTimers();

  profilesGrid.innerHTML = "";
  profilesGrid.setAttribute("aria-busy", "true");

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < count; index += 1) {
    const card = document.createElement("article");
    card.className = "profile-card is-loading";
    card.innerHTML = `
      <div class="loading-banner"></div>
      <div class="loading-avatar"></div>
      <div class="loading-body">
        <div class="loading-line is-title"></div>
        <div class="loading-line is-subtitle"></div>
        <div class="loading-chip-row">
          <span class="loading-chip"></span>
          <span class="loading-chip"></span>
        </div>
        <div class="loading-line is-bio"></div>
        <div class="loading-line is-bio-short"></div>
        <div class="loading-line is-bio"></div>
      </div>
    `;
    fragment.append(card);
  }

  profilesGrid.append(fragment);
}

function renderErrorState(error) {
  /**
   * Em caso de erro, limpamos timers também.
   */
  clearAllSpotifyTimers();

  profilesGrid.innerHTML = "";

  const card = document.createElement("article");
  card.className = "error-state";
  card.innerHTML = `
    <h3>Falha ao carregar os perfis.</h3>
    <p>
      Verifique o arquivo <code>.env</code>, o token do bot e os IDs em
      <code>config/profiles.config.js</code>. Detalhe: ${escapeHtml(
        error.message || "unexpected error"
      )}
    </p>
  `;

  profilesGrid.append(card);
}

function getInitials(value) {
  return (
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "DP"
  );
}

function isHexColor(value) {
  return typeof value === "string" && /^#[\dA-F]{6}$/i.test(value);
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function handleDiscordLinkClick(event, webUrl) {
  event.preventDefault();

  const userIdMatch = String(webUrl).match(/\/users\/(\d{17,20})/);

  if (!userIdMatch) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const userId = userIdMatch[1];
  const appUrl = `discord://-/users/${userId}`;

  const fallback = window.setTimeout(() => {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }, 900);

  window.location.href = appUrl;

  window.addEventListener(
    "blur",
    () => {
      window.clearTimeout(fallback);
    },
    { once: true }
  );
}

function getSocialLabel(platform) {
  const labels = {
    discord: "Discord",
    instagram: "Instagram",
    x: "X",
    github: "GitHub",
    spotify: "Spotify",
    twitch: "Twitch",
    youtube: "YouTube",
    tiktok: "TikTok",
    steam: "Steam",
    website: "Website"
  };

  return labels[platform] || "Social link";
}

function getPresenceLabel(presence) {
  const statusLabels = {
    online: "Online",
    idle: "Away",
    dnd: "Do not disturb",
    offline: "Offline"
  };

  const platforms = [];
  if (presence.onDesktop) platforms.push("desktop");
  if (presence.onMobile) platforms.push("mobile");
  if (presence.onWeb) platforms.push("web");

  const baseLabel = statusLabels[presence.status] || "Presence";
  return platforms.length ? `${baseLabel} on ${platforms.join(", ")}` : baseLabel;
}

function getActivityKicker(type) {
  const labels = {
    0: "Playing now",
    1: "Streaming now",
    2: "Listening now",
    3: "Watching now",
    4: "Custom status",
    5: "Competing now"
  };

  return labels[type] || "Current activity";
}

function formatActivityTiming(activity) {
  if (typeof activity.startedAt === "number") {
    const elapsedMs = Date.now() - activity.startedAt;

    if (elapsedMs > 0) {
      return `For ${formatDuration(elapsedMs)}`;
    }
  }

  if (typeof activity.endedAt === "number") {
    const remainingMs = activity.endedAt - Date.now();

    if (remainingMs > 0) {
      return `${formatDuration(remainingMs)} left`;
    }
  }

  return null;
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(1, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getVolumeIconMarkup(volume) {
  const common = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';

  if (volume <= 0) {
    return `<svg ${common}><path fill="currentColor" d="M14.7 5.3a1 1 0 0 1 1.4 1.4L14.83 8l1.27 1.3a1 1 0 0 1-1.43 1.4L13.4 9.44l-1.28 1.27a1 1 0 1 1-1.4-1.42L12 8l-1.28-1.3a1 1 0 0 1 1.43-1.4l1.26 1.27zM4 9.5a1 1 0 0 1 1-1h2.8l3.5-3.02A1 1 0 0 1 13 6.25v11.5a1 1 0 0 1-1.7.76L7.8 15.5H5a1 1 0 0 1-1-1z"/></svg>`;
  }

  if (volume < 0.5) {
    return `<svg ${common}><path fill="currentColor" d="M5 9.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.8l3.5 3.01a1 1 0 0 0 1.7-.75V6.24a1 1 0 0 0-1.7-.75L7.8 8.5zm11.16-1.96a1 1 0 0 1 1.41.1 6.33 6.33 0 0 1 0 8.72 1 1 0 0 1-1.51-1.32 4.33 4.33 0 0 0 0-6.08 1 1 0 0 1 .1-1.42"/></svg>`;
  }

  return `<svg ${common}><path fill="currentColor" d="M5 9.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.8l3.5 3.01a1 1 0 0 0 1.7-.75V6.24a1 1 0 0 0-1.7-.75L7.8 8.5zm10.83-3.43a1 1 0 0 1 1.4.15 9.48 9.48 0 0 1 0 11.56 1 1 0 1 1-1.55-1.26 7.48 7.48 0 0 0 0-9.04 1 1 0 0 1 .15-1.4m-2.64 2.2a1 1 0 0 1 1.4.13 5.93 5.93 0 0 1 0 7.2 1 1 0 0 1-1.53-1.28 3.93 3.93 0 0 0 0-4.64 1 1 0 0 1 .13-1.4"/></svg>`;
}

function getSocialIcon(platform) {
  const common = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const icons = {
    discord: `<svg ${common}><path fill="currentColor" d="M20.32 4.37a16.7 16.7 0 0 0-4.1-1.28l-.2.4a15.2 15.2 0 0 0-.58 1.2 15.4 15.4 0 0 0-4.88 0 12.2 12.2 0 0 0-.6-1.2l-.18-.4a16.5 16.5 0 0 0-4.11 1.28C3.1 8.26 2.39 12.06 2.74 15.81a16.8 16.8 0 0 0 5.03 2.56l1.08-1.8a10.9 10.9 0 0 1-1.7-.83l.42-.32c3.27 1.54 6.82 1.54 10.05 0l.44.32c-.55.33-1.12.6-1.72.84l1.08 1.79a16.7 16.7 0 0 0 5.04-2.56c.42-4.35-.72-8.12-2.14-11.44M9.68 13.52c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c1 0 1.8.9 1.78 2 0 1.1-.79 2-1.78 2m4.64 0c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c1 0 1.8.9 1.78 2 0 1.1-.79 2-1.78 2"/></svg>`,
    instagram: `<svg ${common}><path fill="currentColor" d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2m0 1.8A3.7 3.7 0 0 0 3.8 7.5v9a3.7 3.7 0 0 0 3.7 3.7h9a3.7 3.7 0 0 0 3.7-3.7v-9a3.7 3.7 0 0 0-3.7-3.7zm9.95 1.35a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1M12 6.85A5.15 5.15 0 1 1 6.85 12 5.15 5.15 0 0 1 12 6.85m0 1.8A3.35 3.35 0 1 0 15.35 12 3.35 3.35 0 0 0 12 8.65"/></svg>`,
    x: `<svg ${common}><path fill="currentColor" d="M18.9 2H22l-6.77 7.73L23.2 22h-6.25l-4.9-7.2L5.76 22H2.64l7.24-8.28L1 2h6.4l4.43 6.59zm-1.1 18h1.73L6.46 3.9H4.6z"/></svg>`,
    github: `<svg ${common}><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.5c.5.1.68-.21.68-.48v-1.7c-2.78.61-3.37-1.17-3.37-1.17a2.65 2.65 0 0 0-1.12-1.46c-.92-.63.07-.62.07-.62a2.1 2.1 0 0 1 1.53 1.03 2.14 2.14 0 0 0 2.93.83 2.15 2.15 0 0 1 .64-1.35c-2.22-.26-4.56-1.1-4.56-4.92a3.83 3.83 0 0 1 1.03-2.67 3.56 3.56 0 0 1 .1-2.63s.84-.27 2.75 1.02a9.73 9.73 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02a3.56 3.56 0 0 1 .1 2.63 3.82 3.82 0 0 1 1.03 2.67c0 3.82-2.34 4.66-4.57 4.92a2.42 2.42 0 0 1 .69 1.88v2.8c0 .27.18.58.69.48A10 10 0 0 0 12 2"/></svg>`,
    spotify: `<svg ${common}><path fill="currentColor" d="M12 2.75a9.25 9.25 0 1 0 9.25 9.25A9.26 9.26 0 0 0 12 2.75m4.1 13.34a.63.63 0 0 1-.86.21 8.78 8.78 0 0 0-4.81-.81.63.63 0 1 1-.14-1.25 10.01 10.01 0 0 1 5.5.95.63.63 0 0 1 .31.9m1-2.23a.8.8 0 0 1-1.1.26 10.83 10.83 0 0 0-5.97-.95.8.8 0 1 1-.24-1.58 12.45 12.45 0 0 1 6.88 1.1.8.8 0 0 1 .43 1.17m.11-2.39a.97.97 0 0 1-1.32.32 12.84 12.84 0 0 0-6.52-1.1.97.97 0 1 1-.2-1.93 14.55 14.55 0 0 1 7.5 1.27.97.97 0 0 1 .54 1.44"/></svg>`,
    twitch: `<svg ${common}><path fill="currentColor" d="M4 3h17v11.2l-3.2 3.2h-3.2L11.8 20H8.6v-2.6H4zm1.8 1.8v10h3.6V17l2.2-2.2h3.6l2-2V4.8zm4.8 6.6h1.8v-4h-1.8zm4.4 0h1.8v-4H15z"/></svg>`,
    youtube: `<svg ${common}><path fill="currentColor" d="M21.58 7.19a2.8 2.8 0 0 0-1.97-1.98C17.88 4.75 12 4.75 12 4.75s-5.88 0-7.61.46A2.8 2.8 0 0 0 2.42 7.2 29 29 0 0 0 2 12a29 29 0 0 0 .42 4.8 2.8 2.8 0 0 0 1.97 1.98c1.73.46 7.61.46 7.61.46s5.88 0 7.61-.46a2.8 2.8 0 0 0 1.97-1.98A29 29 0 0 0 22 12a29 29 0 0 0-.42-4.81M9.75 15.02V8.98L15 12z"/></svg>`,
    tiktok: `<svg ${common}><path fill="currentColor" d="M14.5 3c.28 2.23 1.54 3.8 3.6 4.05v2.4a6.55 6.55 0 0 1-3.58-1.17v5.12a5.38 5.38 0 1 1-5.37-5.37c.3 0 .62.03.92.1v2.63a2.62 2.62 0 1 0 1.83 2.5V3z"/></svg>`,
    steam: `<svg ${common}><path fill="currentColor" d="M12 2a10 10 0 0 0-9.76 12.2l4.28 1.78a2.8 2.8 0 1 1-.78 2.54l-1.54-.64A10 10 0 1 0 12 2m0 5.2a3.8 3.8 0 1 1-3.8 3.8A3.8 3.8 0 0 1 12 7.2m0 1.7A2.1 2.1 0 1 0 14.1 11 2.1 2.1 0 0 0 12 8.9M7.4 18.1a1.15 1.15 0 1 0-1.15 1.15A1.15 1.15 0 0 0 7.4 18.1"/></svg>`,
    website: `<svg ${common}><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9m5.95 8h-2.18a13.7 13.7 0 0 0-1.02-4.07A7.03 7.03 0 0 1 17.95 11M12 4.85c.8.9 1.63 2.68 1.95 5.15h-3.9C10.37 7.53 11.2 5.75 12 4.85M9.25 6.93A13.7 13.7 0 0 0 8.23 11H6.05a7.03 7.03 0 0 1 3.2-4.07M6.05 13h2.18a13.7 13.7 0 0 0 1.02 4.07A7.03 7.03 0 0 1 6.05 13m5.95 6.15c-.8-.9-1.63-2.68-1.95-5.15h3.9c-.32 2.47-1.15 4.25-1.95 5.15m2.75-2.08A13.7 13.7 0 0 0 15.77 13h2.18a7.03 7.03 0 0 1-3.2 4.07"/></svg>`
  };

  return icons[platform] || null;
}