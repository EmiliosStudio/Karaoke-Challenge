'use strict';

/* ==========================================================================
   KARAOKE CHALLENGE - main.js
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* 1. ESTADO GLOBAL                                                       */
/* ---------------------------------------------------------------------- */

const state = {
  songs: [],
  currentSong: null,
  lyrics: [],
  currentLineIndex: -1,

  fadeOutTriggered: false,
  fadeOutRAF: null,

  isScrubbing: false,

  mediaStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  isRecording: false,
  recordingObjectUrl: null
};

const FADE_OUT_SECONDS = 5;

/* ---------------------------------------------------------------------- */
/* 2. REFERENCIAS DOM                                                     */
/* ---------------------------------------------------------------------- */

const dom = {
  /* Screens */
  screenMenu: document.getElementById('screen-menu'),
  screenSongs: document.getElementById('screen-songs'),
  screenKaraoke: document.getElementById('screen-karaoke'),

  /* Menu */
  btnPlay: document.getElementById('btnPlay'),
  btnHowTo: document.getElementById('btnHowTo'),
  btnCredits: document.getElementById('btnCredits'),

  /* Songs */
  btnBackFromSongs: document.getElementById('btnBackFromSongs'),
  songsList: document.getElementById('songsList'),
  songsEmpty: document.getElementById('songsEmpty'),

  /* Karaoke */
  btnBackFromKaraoke: document.getElementById('btnBackFromKaraoke'),
  karaokeBg: document.getElementById('karaokeBg'),
  karaokeCover: document.getElementById('karaokeCover'),
  karaokeTitle: document.getElementById('karaokeTitle'),
  karaokeArtist: document.getElementById('karaokeArtist'),
  lyricsScroll: document.getElementById('lyricsScroll'),

  /* Audio */
  audioPlayer: document.getElementById('audioPlayer'),
  timeCurrent: document.getElementById('timeCurrent'),
  timeDuration: document.getElementById('timeDuration'),
  progressBar: document.getElementById('progressBar'),
  progressFill: document.getElementById('progressFill'),
  progressHandle: document.getElementById('progressHandle'),

  /* Playback */
  btnRewind: document.getElementById('btnRewind'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnForward: document.getElementById('btnForward'),
  iconPlay: document.getElementById('iconPlay'),
  iconPause: document.getElementById('iconPause'),

  /* Recording */
  btnRecord: document.getElementById('btnRecord'),
  recordLabel: document.getElementById('recordLabel'),
  btnDownload: document.getElementById('btnDownload'),
  recordStatus: document.getElementById('recordStatus'),

  /* Modals */
  modalHowTo: document.getElementById('modalHowTo'),
  modalCredits: document.getElementById('modalCredits')
};

/* ---------------------------------------------------------------------- */
/* 3. NAVEGACIÓN                                                          */
/* ---------------------------------------------------------------------- */

function showScreen(screenEl) {
  [
    dom.screenMenu,
    dom.screenSongs,
    dom.screenKaraoke
  ].forEach((el) => {
    if (el) {
      el.classList.toggle('is-active', el === screenEl);
    }
  });
}

function goToMenu() {
  stopPlaybackAndRecording();
  showScreen(dom.screenMenu);
}

function goToSongs() {
  stopPlaybackAndRecording();
  showScreen(dom.screenSongs);
}

function goToKaraoke() {
  showScreen(dom.screenKaraoke);
}

/* ---------------------------------------------------------------------- */
/* 4. MODALES                                                              */
/* ---------------------------------------------------------------------- */

function openModal(modalEl) {
  if (!modalEl) return;

  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeModal(modalEl) {
  if (!modalEl) return;

  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
}

function closeAllModals() {
  closeModal(dom.modalHowTo);
  closeModal(dom.modalCredits);
}

/* ---------------------------------------------------------------------- */
/* 5. CARGA DE SONGS.JSON                                                  */
/* ---------------------------------------------------------------------- */

async function loadSongs() {
  try {
    const response = await fetch('songs.json', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`No se pudo cargar songs.json (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('songs.json vacío o inválido');
    }

    state.songs = data;

    renderSongCards(data);

    console.log('[Karaoke] Canciones cargadas:', data.length);
  } catch (err) {
    console.error('[Karaoke] Error cargando songs.json:', err);

    if (dom.songsEmpty) {
      dom.songsEmpty.hidden = false;
    }
  }
}

function renderSongCards(songs) {
  if (!dom.songsList) return;

  dom.songsList.innerHTML = '';

  songs.forEach((song, index) => {
    const card = document.createElement('article');

    card.className = 'song-card';
    card.style.animationDelay = `${index * 70}ms`;

    const coverPath =
      `songs/${song.folder}/${song.cover}`;

    const cover = document.createElement('img');

    cover.className = 'song-cover';
    cover.alt = `Carátula de ${song.title || 'canción'}`;
    cover.loading = 'lazy';
    cover.src = coverPath;

    cover.onerror = () => {
      cover.onerror = null;
      cover.src = buildFallbackCoverDataUri();
    };

    const info = document.createElement('div');

    info.className = 'song-info';
    info.innerHTML = '<h3></h3><p></p>';

    const title = info.querySelector('h3');
    const artist = info.querySelector('p');

    if (title) {
      title.textContent = song.title || 'Título desconocido';
    }

    if (artist) {
      artist.textContent = song.artist || 'Artista desconocido';
    }

    const playBtn = document.createElement('button');

    playBtn.type = 'button';
    playBtn.className = 'song-play-btn';
    playBtn.textContent = 'Jugar';

    playBtn.addEventListener('click', () => {
      startKaraoke(song);
    });

    card.appendChild(cover);
    card.appendChild(info);
    card.appendChild(playBtn);

    dom.songsList.appendChild(card);
  });
}

/* ---------------------------------------------------------------------- */
/* 6. FALLBACK DE CARÁTULA                                                */
/* ---------------------------------------------------------------------- */

function buildFallbackCoverDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
      <rect width="120" height="120" fill="#171224"/>
      <path
        d="M40 80 L40 40 L85 32 L85 72"
        stroke="#ff3d9a"
        stroke-width="4"
        fill="none"
        stroke-linecap="round"
      />
      <circle cx="34" cy="82" r="10" fill="#7c5cff"/>
      <circle cx="79" cy="74" r="10" fill="#ff3d9a"/>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---------------------------------------------------------------------- */
/* 7. PARSER LRC                                                          */
/* ---------------------------------------------------------------------- */

/*
  Formatos aceptados:

  [00:01]Texto
  [00:01.1]Texto
  [00:01.10]Texto
  [00:01.100]Texto
  [00:01:10]Texto
  [00:01:100]Texto

  También admite varias marcas en una misma línea:

  [00:01.00][00:05.50]Texto
*/

function parseLRC(raw) {
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\r?\n/);

  const timeTag =
    /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  const result = [];

  lines.forEach((line) => {
    if (!line.trim()) {
      return;
    }

    const tags = [...line.matchAll(timeTag)];

    /*
      Si no hay timestamps, probablemente sea un metadato:
      [ar:Artista]
      [ti:Título]
      [al:Álbum]
      etc.
    */
    if (tags.length === 0) {
      return;
    }

    const text = line.replace(timeTag, '').trim();

    tags.forEach((match) => {
      const minutes = parseInt(match[1], 10) || 0;
      const seconds = parseInt(match[2], 10) || 0;

      let fraction = 0;

      if (match[3]) {
        const digits = match[3];

        if (digits.length === 1) {
          fraction = parseInt(digits, 10) / 10;
        } else if (digits.length === 2) {
          fraction = parseInt(digits, 10) / 100;
        } else {
          fraction = parseInt(digits, 10) / 1000;
        }
      }

      const totalSeconds =
        minutes * 60 +
        seconds +
        fraction;

      result.push({
        time: totalSeconds,
        text
      });
    });
  });

  result.sort((a, b) => a.time - b.time);

  return result;
}

/* ---------------------------------------------------------------------- */
/* 8. CARGA DE LA LETRA                                                   */
/* ---------------------------------------------------------------------- */

async function loadLyrics(song) {
  const path =
    `songs/${song.folder}/${song.lyric}`;

  console.log('========================================');
  console.log('[Karaoke] CARGANDO LETRA');
  console.log('[Karaoke] Canción:', song.title);
  console.log('[Karaoke] Carpeta:', song.folder);
  console.log('[Karaoke] Archivo:', song.lyric);
  console.log('[Karaoke] Ruta:', path);

  try {
    const response = await fetch(path, {
      cache: 'no-store'
    });

    console.log(
      '[Karaoke] Estado HTTP:',
      response.status
    );

    console.log(
      '[Karaoke] Response OK:',
      response.ok
    );

    if (!response.ok) {
      throw new Error(
        `No se encontró el archivo LRC (${response.status})`
      );
    }

    const raw = await response.text();

    console.log(
      '[Karaoke] Longitud del LRC:',
      raw.length
    );

    console.log(
      '[Karaoke] Contenido LRC:',
      raw
    );

    const parsed = parseLRC(raw);

    console.log(
      '[Karaoke] Líneas detectadas:',
      parsed.length
    );

    console.log(
      '[Karaoke] Datos parsed:',
      parsed
    );

    if (parsed.length === 0) {
      throw new Error(
        'El LRC está vacío o no contiene timestamps válidos'
      );
    }

    console.log('[Karaoke] ✅ Letra cargada correctamente');
    console.log('========================================');

    return parsed;

  } catch (err) {
    console.error(
      '[Karaoke] ❌ ERROR CARGANDO LETRA:',
      err
    );

    console.log('========================================');

    return [
      {
        time: 0,
        text: 'Letra no disponible para esta canción.'
      }
    ];
  }
}

/* ---------------------------------------------------------------------- */
/* 9. PANTALLA DE KARAOKE                                                  */
/* ---------------------------------------------------------------------- */

async function startKaraoke(song) {
  cleanupKaraokeState();

  state.currentSong = song;

  const coverPath =
    `songs/${song.folder}/${song.cover}`;

  const audioPath =
    `songs/${song.folder}/${song.audio}`;

  /* Información */
  dom.karaokeTitle.textContent =
    song.title || 'Título desconocido';

  dom.karaokeArtist.textContent =
    song.artist || 'Artista desconocido';

  /* Portada */
  dom.karaokeCover.src = coverPath;

  dom.karaokeCover.onerror = () => {
    dom.karaokeCover.onerror = null;
    dom.karaokeCover.src =
      buildFallbackCoverDataUri();
  };

  /* Fondo */
  dom.karaokeBg.style.backgroundImage =
    `url("${coverPath}")`;

  resetPlayerUI();

  /* Cargar letra antes de mostrar la pantalla */
  state.lyrics = await loadLyrics(song);

  renderLyrics(state.lyrics);

  /* Audio */
  dom.audioPlayer.src = audioPath;
  dom.audioPlayer.volume = 1;
  dom.audioPlayer.load();

  dom.audioPlayer.onerror = () => {
    console.error(
      '[Karaoke] Error cargando audio:',
      audioPath
    );

    if (dom.recordStatus) {
      dom.recordStatus.textContent =
        'No se pudo cargar el audio de esta canción.';
    }
  };

  goToKaraoke();
}

/* ---------------------------------------------------------------------- */
/* 10. RENDER DE LA LETRA                                                  */
/* ---------------------------------------------------------------------- */

function renderLyrics(lyrics) {
  if (!dom.lyricsScroll) {
    return;
  }

  dom.lyricsScroll.innerHTML = '';

  state.currentLineIndex = -1;

  if (!lyrics || lyrics.length === 0) {
    const p = document.createElement('p');

    p.className = 'lyric-line';
    p.textContent =
      'Letra no disponible para esta canción.';

    dom.lyricsScroll.appendChild(p);

    return;
  }

  lyrics.forEach((line, index) => {
    const p = document.createElement('p');

    p.className = 'lyric-line';

    p.textContent =
      line.text || '\u00A0';

    p.dataset.index = String(index);

    dom.lyricsScroll.appendChild(p);
  });
}

/* ---------------------------------------------------------------------- */
/* 11. RESET DEL REPRODUCTOR                                               */
/* ---------------------------------------------------------------------- */

function resetPlayerUI() {
  if (dom.iconPlay) {
    dom.iconPlay.hidden = false;
  }

  if (dom.iconPause) {
    dom.iconPause.hidden = true;
  }

  dom.btnPlayPause.setAttribute(
    'aria-label',
    'Reproducir'
  );

  dom.progressFill.style.width = '0%';

  dom.progressHandle.style.left = '0%';

  dom.timeCurrent.textContent = '0:00';

  dom.timeDuration.textContent = '0:00';

  dom.recordStatus.textContent = '';

  dom.btnDownload.hidden = true;

  dom.btnRecord.classList.remove(
    'is-recording'
  );

  dom.recordLabel.textContent =
    'Grabar voz';

  state.fadeOutTriggered = false;
}

/* ---------------------------------------------------------------------- */
/* 12. TIEMPO                                                              */
/* ---------------------------------------------------------------------- */

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) {
    seconds = 0;
  }

  const m = Math.floor(seconds / 60);

  const s = Math.floor(seconds % 60);

  return `${m}:${s
    .toString()
    .padStart(2, '0')}`;
}

/* ---------------------------------------------------------------------- */
/* 13. PLAY / PAUSE                                                        */
/* ---------------------------------------------------------------------- */

function togglePlayPause() {
  if (!dom.audioPlayer.src) {
    return;
  }

  if (dom.audioPlayer.paused) {
    const promise =
      dom.audioPlayer.play();

    if (promise) {
      promise.catch((err) => {
        console.error(
          '[Karaoke] No se pudo reproducir:',
          err
        );
      });
    }
  } else {
    dom.audioPlayer.pause();
  }
}

function handlePlay() {
  dom.iconPlay.hidden = true;
  dom.iconPause.hidden = false;

  dom.btnPlayPause.setAttribute(
    'aria-label',
    'Pausar'
  );
}

function handlePause() {
  dom.iconPlay.hidden = false;
  dom.iconPause.hidden = true;

  dom.btnPlayPause.setAttribute(
    'aria-label',
    'Reproducir'
  );
}

/* ---------------------------------------------------------------------- */
/* 14. METADATOS DE AUDIO                                                  */
/* ---------------------------------------------------------------------- */

function handleLoadedMetadata() {
  dom.timeDuration.textContent =
    formatTime(dom.audioPlayer.duration);
}

/* ---------------------------------------------------------------------- */
/* 15. TIMEUPDATE                                                          */
/* ---------------------------------------------------------------------- */

function handleTimeUpdate() {
  const audio = dom.audioPlayer;

  const duration =
    audio.duration || 0;

  const current =
    audio.currentTime;

  if (!state.isScrubbing) {
    const pct =
      duration
        ? (current / duration) * 100
        : 0;

    dom.progressFill.style.width =
      `${pct}%`;

    dom.progressHandle.style.left =
      `${pct}%`;

    dom.timeCurrent.textContent =
      formatTime(current);
  }

  updateCurrentLyricLine(current);

  handleFadeOut(
    current,
    duration
  );
}

/* ---------------------------------------------------------------------- */
/* 16. SINCRONIZACIÓN DE LETRA                                             */
/* ---------------------------------------------------------------------- */

function updateCurrentLyricLine(currentTime) {
  if (state.lyrics.length === 0) {
    return;
  }

  let newIndex = -1;

  for (
    let i = 0;
    i < state.lyrics.length;
    i++
  ) {
    if (
      state.lyrics[i].time <= currentTime
    ) {
      newIndex = i;
    } else {
      break;
    }
  }

  if (
    newIndex ===
    state.currentLineIndex
  ) {
    return;
  }

  state.currentLineIndex =
    newIndex;

  const lines =
    dom.lyricsScroll.querySelectorAll(
      '.lyric-line'
    );

  lines.forEach((el, idx) => {
    el.classList.remove(
      'is-current',
      'is-past'
    );

    if (idx < newIndex) {
      el.classList.add(
        'is-past'
      );
    }

    if (idx === newIndex) {
      el.classList.add(
        'is-current'
      );
    }
  });

  if (newIndex >= 0) {
    scrollToCurrentLine(
      lines[newIndex]
    );
  }
}

/* ---------------------------------------------------------------------- */
/* 17. FIN DE CANCIÓN                                                      */
/* ---------------------------------------------------------------------- */

function handleEnded() {
  handlePause();

  dom.audioPlayer.volume = 1;

  state.fadeOutTriggered = false;
}

/* ---------------------------------------------------------------------- */
/* 18. AUTO-SCROLL                                                         */
/* ---------------------------------------------------------------------- */

function scrollToCurrentLine(lineEl) {
  if (!lineEl) {
    return;
  }

  const container =
    dom.lyricsScroll;

  const containerRect =
    container.getBoundingClientRect();

  const lineRect =
    lineEl.getBoundingClientRect();

  const offset =
    (
      lineRect.top +
      lineRect.height / 2
    ) -
    (
      containerRect.top +
      containerRect.height / 2
    );

  container.scrollBy({
    top: offset,
    behavior: 'smooth'
  });
}

/* ---------------------------------------------------------------------- */
/* 19. FADE OUT                                                            */
/* ---------------------------------------------------------------------- */

function handleFadeOut(
  currentTime,
  duration
) {
  if (
    !duration ||
    state.fadeOutTriggered
  ) {
    return;
  }

  const remaining =
    duration - currentTime;

  if (
    remaining <= FADE_OUT_SECONDS &&
    remaining > 0
  ) {
    state.fadeOutTriggered = true;

    runFadeOut(remaining);
  }
}

function runFadeOut(
  remainingSeconds
) {
  const audio =
    dom.audioPlayer;

  const startVolume =
    audio.volume;

  const startTime =
    performance.now();

  const durationMs =
    remainingSeconds * 1000;

  if (state.fadeOutRAF) {
    cancelAnimationFrame(
      state.fadeOutRAF
    );
  }

  function step(now) {
    if (
      audio.paused ||
      audio.ended
    ) {
      return;
    }

    const elapsed =
      now - startTime;

    const progress =
      Math.min(
        elapsed / durationMs,
        1
      );

    audio.volume =
      Math.max(
        startVolume *
          (1 - progress),
        0
      );

    if (progress < 1) {
      state.fadeOutRAF =
        requestAnimationFrame(
          step
        );
    }
  }

  state.fadeOutRAF =
    requestAnimationFrame(
      step
    );
}

/* ---------------------------------------------------------------------- */
/* 20. GRABACIÓN DE VOZ                                                    */
/* ---------------------------------------------------------------------- */

function pickSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  if (
    typeof MediaRecorder ===
      'undefined' ||
    !MediaRecorder.isTypeSupported
  ) {
    return '';
  }

  return (
    candidates.find(
      (type) =>
        MediaRecorder.isTypeSupported(
          type
        )
    ) || ''
  );
}

async function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
    return;
  }

  if (
    typeof MediaRecorder ===
      'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices
      .getUserMedia
  ) {
    dom.recordStatus.textContent =
      'Tu navegador no permite grabar audio.';

    return;
  }

  try {
    const stream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true
        });

    state.mediaStream =
      stream;

    const mimeType =
      pickSupportedMimeType();

    const recorder =
      mimeType
        ? new MediaRecorder(
            stream,
            { mimeType }
          )
        : new MediaRecorder(
            stream
          );

    state.mediaRecorder =
      recorder;

    state.recordedChunks =
      [];

    recorder.ondataavailable =
      (event) => {
        if (
          event.data &&
          event.data.size > 0
        ) {
          state.recordedChunks.push(
            event.data
          );
        }
      };

    recorder.onstop = () => {
      finalizeRecording(
        mimeType ||
          'audio/webm'
      );
    };

    recorder.onerror =
      (event) => {
        console.error(
          '[Karaoke] Error de grabación:',
          event.error
        );

        dom.recordStatus.textContent =
          'Ocurrió un error durante la grabación.';

        stopRecording();
      };

    recorder.start();

    state.isRecording =
      true;

    dom.btnRecord.classList.add(
      'is-recording'
    );

    dom.recordLabel.textContent =
      'Detener grabación';

    dom.recordStatus.textContent =
      'Grabando tu voz…';

    dom.btnDownload.hidden =
      true;

    revokePreviousRecordingUrl();

  } catch (err) {
    console.error(
      '[Karaoke] Permiso de micrófono denegado o error:',
      err
    );

    dom.recordStatus.textContent =
      'No se pudo acceder al micrófono. Revisa los permisos del navegador.';
  }
}

function stopRecording() {
  if (
    state.mediaRecorder &&
    state.mediaRecorder.state !==
      'inactive'
  ) {
    state.mediaRecorder.stop();
  }

  if (state.mediaStream) {
    state.mediaStream
      .getTracks()
      .forEach((track) => {
        track.stop();
      });

    state.mediaStream = null;
  }

  state.isRecording =
    false;

  dom.btnRecord.classList.remove(
    'is-recording'
  );

  dom.recordLabel.textContent =
    'Grabar voz';
}

function finalizeRecording(
  mimeType
) {
  if (
    state.recordedChunks.length ===
    0
  ) {
    dom.recordStatus.textContent =
      'No se grabó ningún audio.';

    return;
  }

  const blob =
    new Blob(
      state.recordedChunks,
      {
        type: mimeType
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  state.recordingObjectUrl =
    url;

  let extension = 'webm';

  if (mimeType.includes('ogg')) {
    extension = 'ogg';
  } else if (
    mimeType.includes('mp4')
  ) {
    extension = 'm4a';
  }

  const songSlug =
    state.currentSong
      ? state.currentSong.folder
      : 'grabacion';

  dom.btnDownload.href =
    url;

  dom.btnDownload.download =
    `mi-voz-${songSlug}.${extension}`;

  dom.btnDownload.hidden =
    false;

  dom.recordStatus.textContent =
    'Grabación lista. Ya puedes descargarla.';
}

function revokePreviousRecordingUrl() {
  if (
    state.recordingObjectUrl
  ) {
    URL.revokeObjectURL(
      state.recordingObjectUrl
    );

    state.recordingObjectUrl =
      null;
  }
}

/* ---------------------------------------------------------------------- */
/* 21. LIMPIEZA                                                            */
/* ---------------------------------------------------------------------- */

function stopPlaybackAndRecording() {
  if (dom.audioPlayer.src) {
    dom.audioPlayer.pause();

    try {
      dom.audioPlayer.currentTime =
        0;
    } catch (err) {
      console.warn(
        '[Karaoke] No se pudo resetear currentTime:',
        err
      );
    }
  }

  dom.audioPlayer.volume =
    1;

  state.fadeOutTriggered =
    false;

  if (state.fadeOutRAF) {
    cancelAnimationFrame(
      state.fadeOutRAF
    );

    state.fadeOutRAF =
      null;
  }

  if (state.isRecording) {
    stopRecording();
  }
}

function cleanupKaraokeState() {
  stopPlaybackAndRecording();

  revokePreviousRecordingUrl();

  state.lyrics = [];

  state.currentLineIndex =
    -1;

  state.recordedChunks =
    [];
}

/* ---------------------------------------------------------------------- */
/* 22. BARRA DE PROGRESO                                                   */
/* ---------------------------------------------------------------------- */

function seekFromClientX(
  clientX
) {
  const rect =
    dom.progressBar.getBoundingClientRect();

  const ratio =
    Math.min(
      Math.max(
        (
          clientX -
          rect.left
        ) / rect.width,
        0
      ),
      1
    );

  const duration =
    dom.audioPlayer.duration ||
    0;

  const newTime =
    ratio * duration;

  dom.audioPlayer.currentTime =
    newTime;

  dom.progressFill.style.width =
    `${ratio * 100}%`;

  dom.progressHandle.style.left =
    `${ratio * 100}%`;

  dom.timeCurrent.textContent =
    formatTime(newTime);
}

function setupProgressBarEvents() {
  dom.progressBar.addEventListener(
    'pointerdown',
    (e) => {
      if (
        !dom.audioPlayer.duration
      ) {
        return;
      }

      state.isScrubbing =
        true;

      seekFromClientX(
        e.clientX
      );

      dom.progressBar.setPointerCapture(
        e.pointerId
      );
    }
  );

  dom.progressBar.addEventListener(
    'pointermove',
    (e) => {
      if (
        !state.isScrubbing
      ) {
        return;
      }

      seekFromClientX(
        e.clientX
      );
    }
  );

  [
    'pointerup',
    'pointercancel'
  ].forEach((evt) => {
    dom.progressBar.addEventListener(
      evt,
      () => {
        state.isScrubbing =
          false;
      }
    );
  });
}

/* ---------------------------------------------------------------------- */
/* 23. EVENTOS                                                             */
/* ---------------------------------------------------------------------- */

function bindEvents() {
  /* Menú */
  dom.btnPlay.addEventListener(
    'click',
    goToSongs
  );

  dom.btnHowTo.addEventListener(
    'click',
    () =>
      openModal(
        dom.modalHowTo
      )
  );

  dom.btnCredits.addEventListener(
    'click',
    () =>
      openModal(
        dom.modalCredits
      )
  );

  /* Modales */
  document
    .querySelectorAll(
      '[data-close-modal]'
    )
    .forEach((btn) => {
      btn.addEventListener(
        'click',
        closeAllModals
      );
    });

  [
    dom.modalHowTo,
    dom.modalCredits
  ].forEach((modal) => {
    if (!modal) {
      return;
    }

    modal.addEventListener(
      'click',
      (e) => {
        if (e.target === modal) {
          closeAllModals();
        }
      }
    );
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
      }
    }
  );

  /* Selector de canciones */
  dom.btnBackFromSongs.addEventListener(
    'click',
    goToMenu
  );

  /* Karaoke */
  dom.btnBackFromKaraoke.addEventListener(
    'click',
    goToSongs
  );

  /* Audio */
  dom.audioPlayer.addEventListener(
    'play',
    handlePlay
  );

  dom.audioPlayer.addEventListener(
    'pause',
    handlePause
  );

  dom.audioPlayer.addEventListener(
    'loadedmetadata',
    handleLoadedMetadata
  );

  dom.audioPlayer.addEventListener(
    'timeupdate',
    handleTimeUpdate
  );

  dom.audioPlayer.addEventListener(
    'ended',
    handleEnded
  );

  /* Play/Pause */
  dom.btnPlayPause.addEventListener(
    'click',
    togglePlayPause
  );

  /* Retroceder */
  dom.btnRewind.addEventListener(
    'click',
    () => {
      dom.audioPlayer.currentTime =
        Math.max(
          dom.audioPlayer.currentTime -
            10,
          0
        );
    }
  );

  /* Avanzar */
  dom.btnForward.addEventListener(
    'click',
    () => {
      const duration =
        dom.audioPlayer.duration ||
        0;

      dom.audioPlayer.currentTime =
        Math.min(
          dom.audioPlayer.currentTime +
            10,
          duration
        );
    }
  );

  /* Barra */
  setupProgressBarEvents();

  /* Grabación */
  dom.btnRecord.addEventListener(
    'click',
    toggleRecording
  );
}

/* ---------------------------------------------------------------------- */
/* 24. INICIALIZACIÓN                                                      */
/* ---------------------------------------------------------------------- */

function init() {
  bindEvents();

  loadSongs();

  showScreen(
    dom.screenMenu
  );
}

document.addEventListener(
  'DOMContentLoaded',
  init
);