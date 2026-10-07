/** Renders a shareable PNG result card on a canvas (no external deps). */
export interface ShareCardInput {
  title: string;
  subtitle: string;
  winnerName: string;
  money: string;
  mapName: string;
  ranking: { name: string; money: string; color: string }[];
  brand: string;
  url: string;
  colors: { primary: string; secondary: string };
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, input.colors.primary);
  grad.addColorStop(1, input.colors.secondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // card
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, 80, 120, W - 160, H - 240, 48);
  ctx.fill();
  ctx.fillStyle = '#1f1300';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px Poppins, system-ui, sans-serif';
  ctx.fillText(input.brand, W / 2, 210);
  ctx.font = '600 32px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#6b5b4a';
  ctx.fillText(input.mapName, W / 2, 262);
  ctx.font = '900 86px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#1f1300';
  ctx.fillText('🏆', W / 2, 390);
  ctx.fillText(input.winnerName, W / 2, 490);
  ctx.font = 'bold 56px Poppins, system-ui, sans-serif';
  ctx.fillStyle = input.colors.primary;
  ctx.fillText(input.money, W / 2, 570);
  ctx.font = '600 30px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#6b5b4a';
  ctx.fillText(input.subtitle, W / 2, 625);
  // ranking
  ctx.textAlign = 'left';
  let y = 700;
  input.ranking.slice(0, 6).forEach((r, i) => {
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(170, y - 12, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f1300';
    ctx.font = `${i === 0 ? 'bold' : '500'} 34px Poppins, system-ui, sans-serif`;
    ctx.fillText(`${i + 1}. ${r.name}`, 200, y);
    ctx.textAlign = 'right';
    ctx.fillText(r.money, W - 170, y);
    ctx.textAlign = 'left';
    y += 54;
  });
  ctx.textAlign = 'center';
  ctx.font = '600 30px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#1f1300';
  ctx.fillText(input.url, W / 2, H - 170);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function shareBlob(
  blob: Blob,
  text: string,
  filename = 'result.png',
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch {
      /* cancelled */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
