import * as THREE from 'three';

export interface PanelTheme {
  primary: string;
  accent: string;
  warning: string;
  background: string;
}

export const panelTheme: PanelTheme = {
  primary: '#00f0ff',
  accent: '#ffb000',
  warning: '#ff2244',
  background: '#070f16',
};

export function createPanelTexture(
  title: string,
  lines: string[],
  width = 768,
  height = 384,
  theme = panelTheme,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawPanel(canvas.getContext('2d')!, title, lines, theme);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

export function updatePanelTexture(texture: THREE.CanvasTexture, title: string, lines: string[], theme = panelTheme): void {
  const canvas = texture.image as HTMLCanvasElement;
  drawPanel(canvas.getContext('2d')!, title, lines, theme);
  texture.needsUpdate = true;
}

function drawPanel(context: CanvasRenderingContext2D, title: string, lines: string[], theme: PanelTheme): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(0,240,255,.065)');
  gradient.addColorStop(1, 'rgba(255,176,0,.018)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = '#1f5066';
  context.lineWidth = 3;
  context.strokeRect(11, 11, width - 22, height - 22);
  context.lineWidth = 1;
  for (let y = 20; y < height; y += 8) {
    context.strokeStyle = 'rgba(150,220,230,.025)';
    context.beginPath();
    context.moveTo(12, y);
    context.lineTo(width - 12, y);
    context.stroke();
  }

  context.fillStyle = theme.primary;
  context.font = '700 34px ui-monospace, Consolas, monospace';
  context.fillText(title.toUpperCase(), 38, 58);
  context.fillStyle = theme.accent;
  context.fillRect(38, 76, Math.min(240, width * 0.34), 4);
  context.fillStyle = 'rgba(160,205,214,.76)';
  context.font = '500 19px ui-monospace, Consolas, monospace';
  lines.forEach((line, index) => {
    const isWarning = line.startsWith('!');
    context.fillStyle = isWarning ? theme.warning : index % 2 === 0 ? '#bceaf0' : '#72a9b4';
    context.fillText(line.replace(/^!/, ''), 40, 118 + index * 35);
  });
  context.fillStyle = 'rgba(0,240,255,.4)';
  context.font = '15px ui-monospace, Consolas, monospace';
  context.fillText(`ASTRA OS // ${String(lines.length).padStart(2, '0')} CHANNELS`, width - 270, height - 30);
}

export function screenMaterial(texture: THREE.CanvasTexture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}
