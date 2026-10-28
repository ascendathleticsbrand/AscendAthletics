/** Builds reusable SVG wrappers around the supplied logo artwork without rewriting the original PNG bytes. */
// Wrap the original supplied artwork in self-contained SVG images.
// The PNG bytes are preserved; display effects live outside React's hydrated tree.
import { readFileSync, writeFileSync } from 'node:fs';

const logos = [
  {
    name: 'wordmark',
    original: 'ascend-horizontal.png',
    viewBox: '19 204 546 145',
    width: 546,
    height: 145,
    imageWidth: 591,
    imageHeight: 555,
    bold: true,
  },
  {
    name: 'monogram',
    original: 'ascend-monogram.png',
    viewBox: '102 95 300 300',
    width: 300,
    height: 300,
    imageWidth: 500,
    imageHeight: 500,
    bold: false,
  },
  {
    name: 'icon',
    original: 'ascend-icon.png',
    viewBox: '115 104 260 260',
    width: 260,
    height: 260,
    imageWidth: 500,
    imageHeight: 500,
    bold: false,
  },
];
for (const logo of logos) {
  const bytes = readFileSync(new URL('../public/brand/' + logo.original, import.meta.url));
  const defs = logo.bold
    ? '<defs><filter id="bold-wordmark" filterUnits="userSpaceOnUse" x="18" y="203" width="548" height="147"><feMorphology in="SourceGraphic" operator="dilate" radius="0.8"/></filter></defs>'
    : '';
  const filter = logo.bold ? ' filter="url(#bold-wordmark)"' : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}" width="${logo.width}" height="${logo.height}">${defs}<image href="data:image/png;base64,${bytes.toString('base64')}" width="${logo.imageWidth}" height="${logo.imageHeight}"${filter}/></svg>` +
    '\n';
  const name = 'ascend-' + logo.name + '.svg';
  writeFileSync(new URL('../public/brand/' + name, import.meta.url), svg);
  console.log('Prepared self-contained official logo: ' + name);
}
