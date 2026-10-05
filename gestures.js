/**
 * Utility: normalized → pixel, xử lý mirror + object-fit cover.
 */
function cameraPoint(x, y, vw, vh, w, h) {
  const scale = Math.max(w / vw, h / vh);
  return {
    x: w - (x * vw * scale + (w - vw * scale) / 2),
    y: y * vh * scale + (h - vh * scale) / 2
  };
}

/** Đếm ≥3 trong 4 ngón duỗi → "mở tay" (naruto/sasuke). */
function checkOpen(pts) {
  let count = 0;
  const wrist = pts[0];
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  for (let i = 0; i < tips.length; i++) {
    const tip = pts[tips[i]];
    const pip = pts[pips[i]];
    if (Math.hypot(tip.x - wrist.x, tip.y - wrist.y) >
        Math.hypot(pip.x - wrist.x, pip.y - wrist.y)) count++;
  }
  return count >= 3;
}

/** Chữ V: trỏ + giữa duỗi, áp út + út gập, 2 ngón sát nhau. */
function isTwoFingerSeal(p, aspect = 16 / 9) {
  if (!p || p.length !== 21) return false;
  const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const size = Math.max(dist(p[0], p[9]), .025);
  const extended = [8, 12, 16, 20].map((tip, i) =>
    dist(p[tip], p[0]) > dist(p[[6, 10, 14, 18][i]], p[0]) + size * .16
  );
  return extended[0] && extended[1] && !extended[2] && !extended[3] &&
         p[8].y < p[5].y - size * .35 &&
         p[12].y < p[9].y - size * .35 &&
         dist(p[8], p[12]) < size * .65;
}

/**
 * Đếm số ngón duỗi (0-4) trong 4 ngón: trỏ, giữa, áp út, út.
 */
function countUpFingers(p, aspect = 16 / 9) {
  const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const size = Math.max(dist(p[0], p[9]), .025);
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const tip = [8, 12, 16, 20][i];
    const pip = [6, 10, 14, 18][i];
    if (dist(p[tip], p[0]) > dist(p[pip], p[0]) + size * .16) count++;
  }
  return count;
}

/** Đúng 1 ngón duỗi (bất kỳ ngón nào) → Katon. */
function isOneFingerUp(p, aspect = 16 / 9) {
  if (!p || p.length !== 21) return false;
  return countUpFingers(p, aspect) === 1;
}

/** Trả về index của ngón đang duỗi (8, 12, 16, hoặc 20). Nếu không → -1. */
function getUpFingerIndex(p, aspect = 16 / 9) {
  const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const size = Math.max(dist(p[0], p[9]), .025);
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (dist(p[tips[i]], p[0]) > dist(p[pips[i]], p[0]) + size * .16) {
      return tips[i];
    }
  }
  return -1;
}

/**
 * Detect all seals từ MediaPipe result.
 * Trả về { clone, wood, katon, okHand }
 */
function detectHandSeals(hands, handedness, aspect = 16 / 9) {
  const result = { clone: false, wood: false, katon: false, okHand: null };
  if (!hands || !handedness) return result;

  for (let i = 0; i < hands.length; i++) {
    const pts = hands[i];
    const cls = handedness[i];
    if (!cls || (cls.score ?? 1) < 0.7) continue;

    // V sign → clone (physical right) / wood (physical left)
    if (isTwoFingerSeal(pts, aspect)) {
      if (cls.label === 'Left')  result.clone = true;
      if (cls.label === 'Right') result.wood  = true;
    }

    // 1 ngón duỗi → katon
    if (isOneFingerUp(pts, aspect)) {
      result.katon = true;
      if (!result.okHand) {
        const tipIdx = getUpFingerIndex(pts, aspect);
        const tip = tipIdx >= 0 ? pts[tipIdx] : pts[9];
        result.okHand = {
          hand: cls.label === 'Left' ? 'right' : 'left',
          landmarks: pts,
          cx: tip.x,
          cy: tip.y
        };
      }
    }
  }
  return result;
}

// ⭐ QUAN TRỌNG — export ra window để file khác dùng
window.cameraPoint = cameraPoint;
window.checkOpen = checkOpen;
window.isTwoFingerSeal = isTwoFingerSeal;
window.countUpFingers = countUpFingers;
window.isOneFingerUp = isOneFingerUp;
window.getUpFingerIndex = getUpFingerIndex;
window.detectHandSeals = detectHandSeals;

console.log('[gestures] loaded:', {
  cameraPoint: typeof cameraPoint,
  checkOpen: typeof checkOpen,
  isOneFingerUp: typeof isOneFingerUp,
  detectHandSeals: typeof detectHandSeals
});