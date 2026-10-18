/**
 * In-page resume viewer. A crayon beside the page can be turned on so a smaller
 * crayon follows the cursor and leaves a mark while the pointer is held down.
 */
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const DRAW_CRAYON_SRC = new URL('assets/crayon.jpg', document.baseURI).href;
const UPRIGHT_CRAYON_SRC = new URL('assets/crayon-upright.jpg', document.baseURI).href;

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

function closePdfViewer() {
  if (!viewer) return;
  loadToken += 1;
  resetTool();
  viewer.hidden = true;
  document.body.classList.remove('pdf-viewer-open');
  pagesEl.replaceChildren();
  window.dispatchEvent(new CustomEvent('pdfviewerclosed'));
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

async function renderPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const maxWidth = Math.min(860, Math.max(240, window.innerWidth - 230));
  const viewport = page.getViewport({ scale: maxWidth / unscaled.width });
  const outputScale = window.devicePixelRatio || 1;

  const sheet = document.createElement('article');
  sheet.className = 'pdf-sheet';

  const pageCanvas = document.createElement('canvas');
  pageCanvas.className = 'pdf-sheet-page';
  const ink = document.createElement('canvas');
  ink.className = 'pdf-sheet-ink';

  for (const canvas of [pageCanvas, ink]) {
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
  }

  sheet.append(pageCanvas, ink);
  pagesEl.append(sheet);

  const transform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];
  await page.render({
    canvasContext: pageCanvas.getContext('2d'),
    viewport,
    transform,
  }).promise;
}

export async function openPdfViewer(pdfUrl) {
  ensureViewer();
  const token = ++loadToken;
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
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    statusEl.textContent = 'Could not open the PDF.';
  }
}
