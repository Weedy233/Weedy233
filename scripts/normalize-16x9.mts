#!/usr/bin/env tsx
/**
 * Normalizes card SVGs to a fixed 16:9 canvas (480x270):
 *  - root svg width/height/viewBox rewritten
 *  - card background rect extended to the full canvas
 *  - original content scaled to fit the canvas width and centered vertically
 *
 * Usage: node normalize-16x9.mts <file.svg> [<file.svg> ...]
 */
import { readFile, writeFile } from "node:fs/promises";

const TARGET_W = 480;
const TARGET_H = 270; // exact 16:9

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node normalize-16x9.mts <file.svg> [...]");
  process.exit(1);
}

for (const file of files) {
  const svg = await readFile(file, "utf8");

  // root opening tag: first <svg ...> block
  const openMatch = svg.match(/<svg\b[^>]*>/);
  if (!openMatch) throw new Error(`${file}: no <svg> root`);
  const open = openMatch[0];
  const wMatch = open.match(/width="([\d.]+)"/);
  const hMatch = open.match(/height="([\d.]+)"/);
  if (!wMatch || !hMatch) throw new Error(`${file}: root svg lacks width/height`);
  const W = parseFloat(wMatch[1]);
  const H = parseFloat(hMatch[1]);

  const k = Math.min(TARGET_W / W, TARGET_H / H);
  const tx = (TARGET_W - W * k) / 2;
  const ty = (TARGET_H - H * k) / 2;

  const newOpen = open
    .replace(/width="[\d.]+"/, `width="${TARGET_W}"`)
    .replace(/height="[\d.]+"/, `height="${TARGET_H}"`)
    .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${TARGET_W} ${TARGET_H}"`);

  let body = svg.slice(open.length, svg.lastIndexOf("</svg>"));

  // extend the card background rect to the full canvas
  const bgRe = /<rect[^>]*data-testid="card-bg"[^>]*>/;
  const bgMatch = body.match(bgRe);
  if (!bgMatch) throw new Error(`${file}: card-bg rect not found`);
  const fillMatch = bgMatch[0].match(/fill="([^"]+)"/);
  const fill = fillMatch ? fillMatch[1] : "#fffefe";
  const newBg = `<rect data-testid="card-bg" x="0" y="0" width="${TARGET_W}" height="${TARGET_H}" rx="4.5" fill="${fill}" stroke-opacity="0"/>`;
  body = body.replace(bgRe, newBg);

  // scale + center the original content
  const wrapped = `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${k.toFixed(4)})">${body}</g>`;

  await writeFile(file, newOpen + wrapped + "</svg>\n", "utf8");
  console.log(
    `normalized ${file}: ${W}x${H} -> ${TARGET_W}x${TARGET_H} (scale ${k.toFixed(3)}, offset ${ty.toFixed(1)})`,
  );
}
