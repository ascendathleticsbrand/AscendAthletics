// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandLogo } from './brand-logo';

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function brandPlacements() {
  return createElement(
    StrictMode,
    null,
    createElement(
      'div',
      null,
      createElement(
        'header',
        null,
        createElement(BrandLogo, { variant: 'icon', className: 'header-logo' }),
      ),
      createElement(
        'main',
        null,
        createElement(BrandLogo, { variant: 'monogram', className: 'page-monogram' }),
      ),
      createElement('footer', null, createElement(BrandLogo, { className: 'footer-logo' })),
      createElement(
        'aside',
        null,
        createElement(BrandLogo, { className: 'admin-mobile-logo' }),
        createElement(BrandLogo, { className: 'admin-logo' }),
      ),
    ),
  );
}

describe('brand logo server and client agreement', () => {
  it('hydrates all header, footer, monogram and admin placements without replacing the server images', async () => {
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    container.innerHTML = renderToString(brandPlacements());
    const serverImages = Array.from(container.querySelectorAll('img'));
    expect(serverImages).toHaveLength(5);

    await act(async () => {
      root = hydrateRoot(container, brandPlacements(), {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
    });
    await act(async () => root!.render(brandPlacements()));

    expect(recoverableErrors).toEqual([]);
    expect(consoleErrors).not.toHaveBeenCalled();
    const hydratedImages = Array.from(container.querySelectorAll('img'));
    expect(hydratedImages).toHaveLength(5);
    hydratedImages.forEach((image, index) => expect(image).toBe(serverImages[index]));
    expect(container.querySelector('svg,defs,filter')).toBeNull();
    expect(
      hydratedImages.map((image) => ({
        source: image.getAttribute('src'),
        alt: image.alt,
        className: image.className,
        width: image.getAttribute('width'),
        height: image.getAttribute('height'),
      })),
    ).toEqual([
      {
        source: '/brand/ascend-icon.svg',
        alt: 'ASCEND ATHLETICS icon',
        className: 'header-logo',
        width: '260',
        height: '260',
      },
      {
        source: '/brand/ascend-monogram.svg',
        alt: 'Official ASCEND monogram',
        className: 'page-monogram',
        width: '300',
        height: '300',
      },
      {
        source: '/brand/ascend-wordmark.svg',
        alt: 'ASCEND ATHLETICS',
        className: 'footer-logo',
        width: '546',
        height: '145',
      },
      {
        source: '/brand/ascend-wordmark.svg',
        alt: 'ASCEND ATHLETICS',
        className: 'admin-mobile-logo',
        width: '546',
        height: '145',
      },
      {
        source: '/brand/ascend-wordmark.svg',
        alt: 'ASCEND ATHLETICS',
        className: 'admin-logo',
        width: '546',
        height: '145',
      },
    ]);
  });

  it.each([
    { asset: 'ascend-wordmark.svg', original: 'ascend-horizontal.png', bold: true },
    { asset: 'ascend-monogram.svg', original: 'ascend-monogram.png', bold: false },
    { asset: 'ascend-icon.svg', original: 'ascend-icon.png', bold: false },
  ])(
    'preserves the supplied artwork inside the self-contained $asset',
    ({ asset, original, bold }) => {
      const svg = readFileSync(join(process.cwd(), 'public', 'brand', asset), 'utf8');
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(parsed.querySelector('parsererror,script,foreignObject')).toBeNull();
      const images = parsed.querySelectorAll('image');
      expect(images).toHaveLength(1);
      const imageSource =
        images[0].getAttribute('href') ?? images[0].getAttribute('xlink:href') ?? '';
      expect(imageSource).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
      expect(Buffer.from(imageSource.split(',')[1], 'base64')).toEqual(
        readFileSync(join(process.cwd(), 'public', 'brand', original)),
      );
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/)/);
      const dilation = parsed.querySelector('feMorphology[operator="dilate"]');
      if (bold) {
        expect(dilation).not.toBeNull();
        expect(Number(dilation!.getAttribute('radius'))).toBeGreaterThan(0);
      } else expect(dilation).toBeNull();
    },
  );
});
