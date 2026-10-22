// 結果用紙の写真を、保存できる大きさ(1枚900KB以下)に縮める
const LIMIT = 900 * 1024; // Firestore の1件の上限(1MB)に収まるように

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読みこめませんでした')); };
    img.src = url;
  });
}

export async function compressPhoto(file) {
  const img = await loadImage(file);
  let maxSide = 1800;
  let quality = 0.78;
  for (let tries = 0; tries < 8; tries++) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= LIMIT) return { data, w, h };
    if (quality > 0.55) quality -= 0.08;
    else maxSide = Math.round(maxSide * 0.82);
  }
  throw new Error('写真が大きすぎて保存できませんでした');
}
