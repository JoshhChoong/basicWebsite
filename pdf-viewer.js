/**
 * In-page resume viewer. A crayon beside the page can be turned on so a smaller
 * crayon follows the cursor and leaves a mark while the pointer is held down.
 * Pages use PDF.js canvas + text + link layers so links and selection work.
 */
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const { TextLayer } = pdfjsLib;

const DRAW_CRAYON_SRC = new URL('assets/crayon.jpg', document.baseURI).href;
const UPRIGHT_CRAYON_SRC = new URL('assets/crayon-upright.png', document.baseURI).href;

let viewer;
let stage;
let pagesEl;
let statusEl;
let crayonButton;
let crayonCursor;
let tipFx = 0.5;
let tipFy = 0.92;
let brush;
let crayonColor = '#d64545';
let loadToken = 0;
let armed = false;
let drawing = false;
let lastTip = null;
let currentPdf = null;
let lastLayoutKey = '';
let resizeTimer = 0;
let resizeListening = false;

function ensureViewer() {
  if (viewer) return;

  viewer = document.createElement('div');
  viewer.className = 'pdf-viewer';
  viewer.hidden = true;
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-modal', 'true');
  viewer.setAttribute('aria-label', 'Resume');

  viewer.innerHTML = `
    <div class="pdf-viewer-bar">
      <p class="pdf-viewer-status"></p>
      <button type="button" class="pdf-viewer-close">Close</button>
    </div>
    <div class="pdf-viewer-stage">
      <div class="pdf-desk">
        <button type="button" class="pdf-crayon-static" aria-pressed="false" aria-label="Crayon">
          <img alt="" draggable="false">
        </button>
        <div class="pdf-pages"></div>
      </div>
    </div>
    <img class="pdf-crayon-cursor" alt="" draggable="false">
  `;

  statusEl = viewer.querySelector('.pdf-viewer-status');
  stage = viewer.querySelector('.pdf-viewer-stage');
  pagesEl = viewer.querySelector('.pdf-pages');
  crayonButton = viewer.querySelector('.pdf-crayon-static');
  crayonCursor = viewer.querySelector('.pdf-crayon-cursor');

  viewer.querySelector('.pdf-viewer-close').addEventListener('click', closePdfViewer);
  crayonButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setArmed(!armed);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && viewer && !viewer.hidden) closePdfViewer();
  });

  viewer.addEventListener('pointerdown', onPointerDown);
  viewer.addEventListener('pointermove', onPointerMove);
  viewer.addEventListener('pointerup', endStroke);
  viewer.addEventListener('pointercancel', endStroke);

  document.body.appendChild(viewer);
  ensureResizeListening();
}

function ensureResizeListening() {
  if (resizeListening) return;
  resizeListening = true;
  window.addEventListener('resize', scheduleRerender);
  window.visualViewport?.addEventListener('resize', scheduleRerender);
}

function getLayoutKey() {
  const vvScale = window.visualViewport?.scale || 1;
  return [
    Math.round(window.innerWidth),
    Math.round((window.devicePixelRatio || 1) * 100),
    Math.round(vvScale * 100),
  ].join(':');
}

function pageCssWidth() {
  return Math.min(860, Math.max(240, window.innerWidth - 230));
}

function scheduleRerender() {
  if (!viewer || viewer.hidden || !currentPdf) return;
  if (getLayoutKey() === lastLayoutKey) return;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    void rerenderAllPages();
  }, 140);
}

async function rerenderAllPages() {
  if (!viewer || viewer.hidden || !currentPdf) return;
  const key = getLayoutKey();
  if (key === lastLayoutKey) return;

  const token = loadToken;
  const scrollTop = stage.scrollTop;
  const sheets = [...pagesEl.querySelectorAll('.pdf-sheet')];
  lastLayoutKey = key;

  for (let i = 0; i < sheets.length; i++) {
    await renderPage(currentPdf, i + 1, sheets[i]);
    if (token !== loadToken) return;
  }

  stage.scrollTop = scrollTop;
}

function setArmed(next) {
  armed = next;
  drawing = false;
  lastTip = null;
  viewer.classList.toggle('is-armed', armed);
  crayonButton.classList.toggle('is-armed', armed);
  crayonButton.setAttribute('aria-pressed', String(armed));
  if (!viewer.hidden && statusEl.textContent !== 'Opening resume…') {
    statusEl.textContent = armed
      ? 'Hold on the page to draw.'
      : 'Click the crayon, then hold on the page to draw.';
  }
}

function resetTool() {
  setArmed(false);
}

export function closePdfViewer() {
  if (!viewer) return;
  loadToken += 1;
  clearTimeout(resizeTimer);
  currentPdf = null;
  lastLayoutKey = '';
  resetTool();
  if (crayonButton) crayonButton.style.height = '';
  viewer.hidden = true;
  document.body.classList.remove('pdf-viewer-open');
  pagesEl.replaceChildren();
  window.dispatchEvent(new CustomEvent('pdfviewerclosed'));
}

function showDrawTantrum() {
  let rage = viewer.querySelector('.pdf-draw-rage');
  if (!rage) {
    rage = document.createElement('p');
    rage.className = 'pdf-draw-rage';
    rage.textContent = '😡😡😡';
    viewer.append(rage);
  }
  rage.classList.remove('is-on');
  viewer.classList.remove('is-shaking');
  void viewer.offsetWidth;
  rage.classList.add('is-on');
  viewer.classList.add('is-shaking');
}

function onPointerDown(event) {
  if (!armed || event.button !== 0) return;
  if (event.target.closest('.pdf-crayon-static, .pdf-viewer-close')) return;
  drawing = true;
  try {
    viewer.setPointerCapture(event.pointerId);
  } catch (_) {}
  lastTip = { x: event.clientX, y: event.clientY };
  placeCursor(event.clientX, event.clientY);
  paintSegment(lastTip, lastTip);
  showDrawTantrum();
}

function onPointerMove(event) {
  if (!armed) return;
  placeCursor(event.clientX, event.clientY);
  if (!drawing) return;
  const tip = { x: event.clientX, y: event.clientY };
  paintSegment(lastTip, tip);
  lastTip = tip;
}

function endStroke() {
  drawing = false;
  lastTip = null;
}

function placeCursor(x, y) {
  crayonCursor.style.left = `${x - crayonCursor.offsetWidth * tipFx}px`;
  crayonCursor.style.top = `${y - crayonCursor.offsetHeight * tipFy}px`;
}

function paintSegment(from, to) {
  if (!from || !to || !brush) return;
  pagesEl.querySelectorAll('.pdf-sheet-ink').forEach((ink) => {
    const rect = ink.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = ink.width / rect.width;
    const scaleY = ink.height / rect.height;
    const x0 = (from.x - rect.left) * scaleX;
    const y0 = (from.y - rect.top) * scaleY;
    const x1 = (to.x - rect.left) * scaleX;
    const y1 = (to.y - rect.top) * scaleY;
    const pad = 24 * scaleX;
    const near = (x, y) => x >= -pad && y >= -pad && x <= ink.width + pad && y <= ink.height + pad;
    if (!near(x0, y0) && !near(x1, y1)) return;
    stampStroke(ink.getContext('2d'), x0, y0, x1, y1, scaleX);
  });
}

function stampStroke(ctx, x0, y0, x1, y1, scale) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const spacing = 2.2 * scale;
  const steps = Math.max(1, Math.ceil(dist / spacing));
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t + (Math.random() - 0.5) * 0.7 * scale;
    const y = y0 + (y1 - y0) * t + (Math.random() - 0.5) * 0.7 * scale;
    const size = (9 + Math.random() * 3.5) * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.34 + Math.random() * 0.18;
    ctx.drawImage(brush, -size * 0.55, -size * 0.38, size * 1.1, size * 0.76);
    ctx.restore();
  }
  ctx.restore();
}

function makeBrush(color) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.92;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.72;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18 + Math.random() * 0.55;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      0.8 + Math.random() * 2.4,
      0.45 + Math.random() * 1.5,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  return canvas;
}

function prepareCutout(src, forDrawing) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxEdge = 900;
      const fit = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * fit));
      const height = Math.max(1, Math.round(img.naturalHeight * fit));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const px = image.data;

      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;
      let tipX = Math.round(width / 2);
      let tipY = -1;
      let tipXSum = 0;
      let tipCount = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = px[i];
          const g = px[i + 1];
          const b = px[i + 2];
          const min = Math.min(r, g, b);
          const max = Math.max(r, g, b);
          if (min > 236 && max - min < 18) {
            const fade = (min - 236) / (255 - 236);
            px[i + 3] = Math.round(px[i + 3] * (1 - fade));
          }
          if (px[i + 3] > 40) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (y > tipY) {
              tipY = y;
              tipXSum = x;
              tipCount = 1;
            } else if (y === tipY) {
              tipXSum += x;
              tipCount += 1;
            }
            if (r > g + 25 && r > b + 25) {
              red += r;
              green += g;
              blue += b;
              samples += 1;
            }
          }
        }
      }

      if (forDrawing && samples > 0) {
        crayonColor = `rgb(${Math.round(red / samples)}, ${Math.round(green / samples)}, ${Math.round(blue / samples)})`;
      }
      if (forDrawing && tipCount > 0) tipX = tipXSum / tipCount;

      ctx.putImageData(image, 0, 0);
      const cropW = Math.max(1, maxX - minX + 1);
      const cropH = Math.max(1, maxY - minY + 1);
      const cropped = document.createElement('canvas');
      cropped.width = cropW;
      cropped.height = cropH;
      cropped.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      if (forDrawing) {
        tipFx = (tipX - minX) / cropW;
        tipFy = (tipY - minY) / cropH;
        brush = makeBrush(crayonColor);
      }
      resolve(cropped.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not load the crayon image.'));
    img.src = src;
  });
}

async function renderLinkLayer(page, viewport, layer) {
  layer.replaceChildren();
  const annotations = await page.getAnnotations({ intent: 'display' });

  for (const annotation of annotations) {
    if (annotation.subtype !== 'Link') continue;

    const rect = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const width = Math.abs(rect[2] - rect[0]);
    const height = Math.abs(rect[3] - rect[1]);
    if (width < 1 || height < 1) continue;

    let el;
    if (annotation.url) {
      el = document.createElement('a');
      el.href = annotation.url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.title = annotation.url;
    } else if (annotation.dest != null) {
      el = document.createElement('a');
      el.href = '#';
      el.addEventListener('click', async (event) => {
        event.preventDefault();
        if (!currentPdf) return;
        try {
          const dest =
            typeof annotation.dest === 'string'
              ? await currentPdf.getDestination(annotation.dest)
              : annotation.dest;
          if (!dest) return;
          const pageRef = dest[0];
          const pageIndex = await currentPdf.getPageIndex(pageRef);
          pagesEl.children[pageIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) {}
      });
    } else {
      continue;
    }

    el.className = 'pdf-link-annotation';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    layer.append(el);
  }
}

async function renderPage(pdf, pageNumber, existingSheet = null) {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const maxWidth = pageCssWidth();
  const viewport = page.getViewport({ scale: maxWidth / unscaled.width });
  const outputScale = window.devicePixelRatio || 1;
  const cssW = viewport.width;
  const cssH = viewport.height;

  let sheet = existingSheet;
  if (!sheet) {
    sheet = document.createElement('article');
    sheet.className = 'pdf-sheet';
    sheet.dataset.pageNumber = String(pageNumber);

    const pageCanvas = document.createElement('canvas');
    pageCanvas.className = 'pdf-sheet-page';
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer pdf-sheet-text';
    const linkLayer = document.createElement('div');
    linkLayer.className = 'pdf-sheet-links';
    const ink = document.createElement('canvas');
    ink.className = 'pdf-sheet-ink';

    sheet.append(pageCanvas, textLayerDiv, linkLayer, ink);
    pagesEl.append(sheet);
  }

  const pageCanvas = sheet.querySelector('.pdf-sheet-page');
  const textLayerDiv = sheet.querySelector('.pdf-sheet-text');
  const linkLayer = sheet.querySelector('.pdf-sheet-links');
  const ink = sheet.querySelector('.pdf-sheet-ink');

  let inkBitmap = null;
  if (ink.width > 0 && ink.height > 0) {
    try {
      inkBitmap = await createImageBitmap(ink);
    } catch (_) {}
  }

  sheet.style.width = `${cssW}px`;
  sheet.style.height = `${cssH}px`;

  if (pageNumber === 1 && crayonButton) {
    crayonButton.style.height = `${Math.round(cssH * 0.5)}px`;
  }

  for (const canvas of [pageCanvas, ink]) {
    canvas.width = Math.floor(cssW * outputScale);
    canvas.height = Math.floor(cssH * outputScale);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }

  if (inkBitmap) {
    ink.getContext('2d').drawImage(inkBitmap, 0, 0, ink.width, ink.height);
    inkBitmap.close?.();
  }

  const transform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];
  await page.render({
    canvasContext: pageCanvas.getContext('2d'),
    viewport,
    transform,
  }).promise;

  textLayerDiv.replaceChildren();
  textLayerDiv.style.width = `${cssW}px`;
  textLayerDiv.style.height = `${cssH}px`;
  textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));

  const textLayer = new TextLayer({
    textContentSource: await page.getTextContent(),
    container: textLayerDiv,
    viewport,
  });
  await textLayer.render();
  await renderLinkLayer(page, viewport, linkLayer);
}

export async function openPdfViewer(pdfUrl) {
  ensureViewer();
  const token = ++loadToken;
  clearTimeout(resizeTimer);
  currentPdf = null;
  lastLayoutKey = '';
  resetTool();
  viewer.hidden = false;
  document.body.classList.add('pdf-viewer-open');
  pagesEl.replaceChildren();
  crayonButton.hidden = true;
  statusEl.textContent = 'Opening resume…';
  stage.scrollTop = 0;

  try {
    const [pdf, drawUrl, uprightUrl] = await Promise.all([
      pdfjsLib.getDocument(pdfUrl).promise,
      prepareCutout(DRAW_CRAYON_SRC, true),
      prepareCutout(UPRIGHT_CRAYON_SRC, false),
    ]);
    if (token !== loadToken) return;

    currentPdf = pdf;
    crayonButton.querySelector('img').src = uprightUrl;
    crayonCursor.src = drawUrl;
    await Promise.all([
      crayonButton.querySelector('img').decode(),
      crayonCursor.decode(),
    ]);
    if (token !== loadToken) return;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      await renderPage(pdf, pageNumber);
      if (token !== loadToken) return;
      if (pageNumber === 1) {
        crayonButton.hidden = false;
        statusEl.textContent = 'Click the crayon, then hold on the page to draw.';
      }
    }
    lastLayoutKey = getLayoutKey();
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    currentPdf = null;
    statusEl.textContent = 'Could not open the PDF.';
  }
}
