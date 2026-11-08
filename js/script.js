// Space Explorer: Astronomy Picture of the Day
// NASA moved APOD to the WordPress API in September 2026.
// The old api.nasa.gov/planetary/apod endpoint is being retired.
const APOD_ENDPOINT = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/';
const API_KEY = 'H7nNTf7ngnWb9rdKHDFH98Q9kGHHHDQfBmfDfTHm';
const DAYS_TO_SHOW = 9;

const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
const apiKeyInput = document.getElementById('apiKey');
const dateForm = document.getElementById('dateForm');
const loadButton = document.getElementById('loadButton');
const gallery = document.getElementById('gallery');
const statusBox = document.getElementById('status');
const rangeDisplay = document.getElementById('rangeDisplay');
const resultsCount = document.getElementById('resultsCount');
const modal = document.getElementById('apodModal');
const modalVisual = document.getElementById('modalVisual');
const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalExplanation = document.getElementById('modalExplanation');
const modalCredit = document.getElementById('modalCredit');
const modalSource = document.getElementById('modalSource');
const factBox = document.getElementById('spaceFact');

// This comes from the supplied dateRange.js file. It initializes both inputs.
setupDateInputs(startInput, endInput);

// Facts are part of the app itself, so they work even when the API is offline.
const SPACE_FACTS = [
  'A day on Venus is longer than a Venusian year. It takes about 243 Earth days to rotate once, but only 225 Earth days to orbit the Sun.',
  'Sunlight takes roughly 8 minutes and 20 seconds to reach Earth. Every sunset is a glimpse into the past.',
  'The International Space Station circles Earth roughly once every 90 minutes. That means its crew sees about 16 sunrises each day.',
  'Neptune was discovered in 1846 after mathematicians predicted where it should be by studying Uranus’s orbit.',
  'The Moon is slowly drifting away from Earth at a rate of about 3.8 centimeters per year.',
  'Mercury takes just 88 Earth days to make one trip around the Sun, the shortest year of any planet.',
  'The Sun contains more than 99% of all the mass in our solar system.',
  'Saturn’s famous rings are made mostly of chunks of water ice, with some rock and dust mixed in.',
  'A black hole has a boundary called the event horizon. Once light crosses that boundary, it cannot escape.'
];
let previousFact = -1;
let currentController = null;

function showRandomFact() {
  let index = Math.floor(Math.random() * SPACE_FACTS.length);
  if (SPACE_FACTS.length > 1 && index === previousFact) {
    index = (index + 1) % SPACE_FACTS.length;
  }
  previousFact = index;
  factBox.textContent = SPACE_FACTS[index];
}

// Work in UTC so daylight-saving changes never cause a 9-day range to become
// an 8- or 10-day range. Inputs use YYYY-MM-DD values.
function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
}

// A change to the start date moves the end date; a change to the end date
// moves the start. At the archive boundaries, shift the entire window.
function syncDates(changedInput) {
  const earliest = startInput.min;
  const latest = endInput.max;

  if (changedInput === 'start' && startInput.value) {
    let start = startInput.value;
    if (start < earliest) start = earliest;
    if (addDays(start, DAYS_TO_SHOW - 1) > latest) {
      start = addDays(latest, -(DAYS_TO_SHOW - 1));
    }
    startInput.value = start;
    endInput.value = addDays(start, DAYS_TO_SHOW - 1);
  } else if (changedInput === 'end' && endInput.value) {
    let end = endInput.value;
    if (end > latest) end = latest;
    if (addDays(end, -(DAYS_TO_SHOW - 1)) < earliest) {
      end = addDays(earliest, DAYS_TO_SHOW - 1);
    }
    endInput.value = end;
    startInput.value = addDays(end, -(DAYS_TO_SHOW - 1));
  }
}

startInput.addEventListener('change', () => syncDates('start'));
endInput.addEventListener('change', () => syncDates('end'));
syncDates('end');

// WordPress APOD fields such as explanation and credits may contain HTML.
// Convert them to plain text instead of inserting untrusted HTML into the page.
function asText(value) {
  if (typeof value !== 'string') return '';
  return new DOMParser().parseFromString(value, 'text/html').body.textContent.trim();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch (_error) {
    return '';
  }
}

function looksLikeImage(url) {
  return /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(url);
}

function extractHtmlMedia(entry, selector, attribute) {
  if (!entry.basic_html) return '';
  const parsed = new DOMParser().parseFromString(entry.basic_html, 'text/html');
  const node = parsed.querySelector(selector);
  return node ? safeUrl(node.getAttribute(attribute)) : '';
}

// In the 2026 APOD API, entry.url is generally an article link, not an image.
// Prefer hdurl for the actual image, with a basic_html fallback.
function getImageUrl(entry) {
  const hd = safeUrl(entry.hdurl);
  if (hd && looksLikeImage(hd)) return hd;
  const htmlImg = extractHtmlMedia(entry, 'img[src]', 'src');
  if (htmlImg && looksLikeImage(htmlImg)) return htmlImg;
  const legacy = safeUrl(entry.url);
  return legacy && looksLikeImage(legacy) ? legacy : '';
}

function isVideo(entry) {
  return entry.media_type === 'video' || entry.media_type === 'iframe';
}

// Some modern APOD video entries contain an iframe or <video> only in
// basic_html. We embed recognized video providers or video files; otherwise
// the NASA article link in the modal gives visitors a reliable way to watch.
function getVideoMedia(entry) {
  if (!entry.basic_html) return null;
  const parsed = new DOMParser().parseFromString(entry.basic_html, 'text/html');
  const iframe = parsed.querySelector('iframe[src]');
  if (iframe) {
    const urlString = safeUrl(iframe.getAttribute('src'));
    if (urlString) {
      const url = new URL(urlString);
      const host = url.hostname.toLowerCase();
      if (['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
        'youtube-nocookie.com', 'player.vimeo.com'].includes(host)) {
        return { type: 'iframe', url: urlString };
      }
    }
  }
  const video = parsed.querySelector('video source[src], video[src]');
  if (video) {
    const urlString = safeUrl(video.getAttribute('src'));
    if (urlString && /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(urlString)) {
      return { type: 'video', url: urlString };
    }
  }
  return null;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeMediaFallback(video) {
  const wrapper = makeElement('div', 'media-fallback');
  const symbol = makeElement('span', 'play-symbol', video ? '▶' : '✦');
  symbol.setAttribute('aria-hidden', 'true');
  wrapper.append(symbol, makeElement('span', 'fallback-label', video ? 'VIDEO TRANSMISSION' : 'SPACE ARCHIVE'));
  return wrapper;
}

function makeGalleryItem(entry, index, count) {
  const article = makeElement('article', 'gallery-item');
  const button = makeElement('button', 'gallery-open');
  button.type = 'button';
  button.setAttribute('aria-label', `View ${asText(entry.title) || 'space story'} from ${formatDate(entry.date)}`);

  const media = makeElement('div', 'gallery-media');
  const video = isVideo(entry);
  const imageUrl = getImageUrl(entry);
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = asText(entry.alt) || asText(entry.title) || 'NASA astronomy photo';
    img.loading = index < 3 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => img.replaceWith(makeMediaFallback(video)));
    media.append(img);
  } else {
    media.append(makeMediaFallback(video));
  }

  media.append(makeElement('span', `media-badge${video ? ' video' : ''}`, video ? '▶ VIDEO' : '✦ IMAGE'));
  const zoom = makeElement('span', 'gallery-zoom', '↗');
  zoom.setAttribute('aria-hidden', 'true');
  media.append(zoom);

  const copy = makeElement('div', 'gallery-copy');
  const topLine = makeElement('div', 'card-topline');
  topLine.append(
    makeElement('time', 'card-date', formatDate(entry.date)),
    makeElement('span', 'card-number', `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`)
  );
  topLine.querySelector('time').dateTime = entry.date;
  copy.append(topLine, makeElement('h3', '', asText(entry.title) || 'Untitled cosmic discovery'));

  button.append(media, copy);
  button.addEventListener('click', () => openModal(entry));
  article.append(button);
  return article;
}

function renderGallery(entries) {
  gallery.replaceChildren();
  const ordered = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  ordered.forEach((entry, index) => gallery.append(makeGalleryItem(entry, index, ordered.length)));
  resultsCount.textContent = `${ordered.length} / ${DAYS_TO_SHOW} STORIES RECEIVED`;
  rangeDisplay.textContent = `${formatDate(startInput.value).toUpperCase()} — ${formatDate(endInput.value).toUpperCase()}`;
}

function openModal(entry) {
  modalTitle.textContent = asText(entry.title) || 'Cosmic discovery';
  modalDate.textContent = `${formatDate(entry.date).toUpperCase()}  /  ${isVideo(entry) ? 'VIDEO' : 'IMAGE'}`;
  modalExplanation.textContent = asText(entry.explanation) || 'Explore the original APOD entry for more details.';
  const credit = asText(entry.credit || entry.copyright);
  modalCredit.textContent = credit ? `CREDIT: ${credit}` : 'IMAGE AND STORY: NASA ASTRONOMY PICTURE OF THE DAY';

  const source = safeUrl(entry.permalink || entry.url) || 'https://science.nasa.gov/';
  modalSource.href = source;
  modalVisual.replaceChildren();
  const video = isVideo(entry);
  const videoMedia = video ? getVideoMedia(entry) : null;
  const imageUrl = getImageUrl(entry);

  if (videoMedia && videoMedia.type === 'iframe') {
    const frame = document.createElement('iframe');
    frame.src = videoMedia.url;
    frame.title = `Video: ${asText(entry.title)}`;
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    modalVisual.append(frame);
  } else if (videoMedia && videoMedia.type === 'video') {
    const player = document.createElement('video');
    player.src = videoMedia.url;
    player.controls = true;
    if (imageUrl) player.poster = imageUrl;
    modalVisual.append(player);
  } else if (!video && imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = asText(entry.alt) || asText(entry.title) || 'Astronomy photo';
    image.addEventListener('error', () => image.replaceWith(makeModalFallback(source, video)));
    modalVisual.append(image);
  } else {
    const fallback = makeModalFallback(source, video);
    if (imageUrl) {
      // New API video hdurl may contain a still image, not the playable video.
      const poster = document.createElement('img');
      poster.src = imageUrl;
      poster.alt = asText(entry.title) || 'Video preview';
      poster.className = 'modal-poster';
      poster.style.cssText = 'width:100%;height:auto;max-height:480px;object-fit:contain';
      poster.addEventListener('error', () => poster.remove());
      fallback.prepend(poster);
    }
    modalVisual.append(fallback);
  }
  if (!modal.open) modal.showModal();
}

function makeModalFallback(source, video) {
  const box = makeMediaFallback(video);
  const link = makeElement('a', 'modal-source', video ? 'WATCH VIDEO ON NASA ↗' : 'VIEW ON NASA ↗');
  link.href = source;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  box.append(link);
  return box;
}

function renderLoadingState() {
  statusBox.className = 'status loading-status';
  statusBox.textContent = 'Receiving imagery from NASA’s space archive…';
  gallery.replaceChildren();
  for (let i = 0; i < DAYS_TO_SHOW; i += 1) {
    const skeleton = makeElement('div', 'gallery-skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    gallery.append(skeleton);
  }
  resultsCount.textContent = 'CONNECTING…';
}

function renderError(message) {
  gallery.replaceChildren();
  const box = makeElement('div', 'placeholder');
  box.append(
    makeElement('span', 'placeholder-orbit', '✳'),
    makeElement('h3', '', 'We lost the signal.'),
    makeElement('p', '', message)
  );
  const retry = makeElement('button', 'modal-source', 'TRY AGAIN ↗');
  retry.type = 'button';
  retry.style.marginTop = '22px';
  retry.addEventListener('click', loadGallery);
  box.append(retry);
  gallery.append(box);
  resultsCount.textContent = 'SIGNAL INTERRUPTED';
}

async function loadGallery() {
  // Validate exactly 9 consecutive calendar days, including both endpoints.
  if (!startInput.value || !endInput.value) {
    statusBox.textContent = 'Please select a valid start and end date.';
    return;
  }
  if (addDays(startInput.value, DAYS_TO_SHOW - 1) !== endInput.value) {
    syncDates('end');
  }
  if (startInput.value < startInput.min || endInput.value > endInput.max) {
    statusBox.textContent = 'Please choose dates within the APOD archive.';
    return;
  }

  if (currentController) currentController.abort();
  const controller = new AbortController();
  currentController = controller;
  renderLoadingState();
  loadButton.disabled = true;

  const params = new URLSearchParams({
    start_date: startInput.value,
    end_date: endInput.value,
    api_key: apiKeyInput.value.trim() || API_KEY
  });

  try {
    const response = await fetch(`${APOD_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error('NASA’s request limit has been reached. Try again later or enter your own free API key above.');
      if (response.status === 403) throw new Error('NASA rejected the API key or request. Check your key and try again.');
      throw new Error(`NASA returned an error (HTTP ${response.status}). Please try again.`);
    }

    const payload = await response.json();
    const entries = Array.isArray(payload) ? payload : [payload];
    const start = startInput.value;
    const end = endInput.value;
    // Avoid unrelated results if the API happens to include extra entries.
    const valid = entries.filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date >= start && item.date <= end);
    if (!valid.length) throw new Error('NASA returned no stories for these dates. Please try another range.');
    if (currentController !== controller) return;

    renderGallery(valid);
    statusBox.className = 'status';
    statusBox.textContent = valid.length === DAYS_TO_SHOW ? '' :
      `NASA returned ${valid.length} of the ${DAYS_TO_SHOW} expected daily entries for this date range.`;
  } catch (error) {
    if (error.name === 'AbortError' || currentController !== controller) return;
    const message = error instanceof TypeError
      ? 'Could not contact NASA. Check your internet connection and try again.'
      : error.message;
    statusBox.className = 'status';
    statusBox.textContent = '';
    renderError(message);
  } finally {
    if (currentController === controller) {
      loadButton.disabled = false;
      currentController = null;
    }
  }
}

dateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadGallery();
});
document.getElementById('closeModal').addEventListener('click', () => modal.close());
modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
modal.addEventListener('close', () => {
  // Removing iframes/video on close stops playback immediately.
  modalVisual.replaceChildren();
});
document.getElementById('newFactButton').addEventListener('click', showRandomFact);

// Give visitors a fact on first paint and automatically fetch the default nine days.
showRandomFact();
loadGallery();