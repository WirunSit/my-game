// Print size + transparency stats for every raw art file
import sharp from 'sharp';
import { readdirSync } from 'node:fs';

const dir = '../art/raw';
for (const f of readdirSync(dir).filter((n) => n.endsWith('.png')).sort()) {
  const { data, info } = await sharp(`${dir}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let clear = 0, solid = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) clear++;
    else if (data[i] === 255) solid++;
  }
  const meta = await sharp(`${dir}/${f}`).metadata();
  const px = (x, y) => { const o = (y * info.width + x) * 4; return `${data[o]},${data[o+1]},${data[o+2]},${data[o+3]}`; };
  console.log(`${f.padEnd(8)} ${info.width}x${info.height} alphaInFile=${meta.hasAlpha} clear=${(clear/n*100).toFixed(0)}% solid=${(solid/n*100).toFixed(0)}% corner=${px(0,0)}`);
}
