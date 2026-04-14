module.exports = {
  intro: {
    enabled: true,
    title: "click",
    subtitle: ""
  },
  backgroundVideo: {
    enabled: true,
    /*
      Place the file in /public/media and point src to it.
      Example:
      src: "/media/background.mp4"
    */
    src: "/media/15439242_3840_2160_24fps.mp4",
    overlayOpacity: 0.48
  },
  music: {
    enabled: true,
    /*
      You can use:
      - a local file in /public/media, for example: /media/theme.mp3
      - or an external direct audio URL (http/https)
    */
    src: "/media/Kerosene.mp3",
    title: "Kerosene",
    artist: "Crystal Castles",
    loop: true,
    volume: 0.55,
    startMuted: false,
    requireInteraction: true
  }
};
