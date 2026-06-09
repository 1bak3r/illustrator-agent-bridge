import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PngPixelAnalysis {
  width: number;
  height: number;
  background: RgbaPixel;
  nonBackgroundPixels: number;
  nonBackgroundRatio: number;
  nonTransparentPixels: number;
  nonTransparentRatio: number;
  contentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  contentCoverage: number;
  touchesCanvasEdge: boolean;
}

export class PngDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PngDecodeError";
  }
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function analyzePngPixels(buffer: Buffer, tolerance = 8): PngPixelAnalysis {
  const png = decodePng(buffer);
  const background = readPixel(png.pixels, 0);
  const totalPixels = png.width * png.height;
  let nonBackgroundPixels = 0;
  let nonTransparentPixels = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const pixel = readPixel(png.pixels, offset);
      const nonBackground = pixelDistance(pixel, background) > tolerance;

      if (pixel.a > 0) {
        nonTransparentPixels += 1;
      }

      if (nonBackground) {
        nonBackgroundPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const contentBounds =
    nonBackgroundPixels > 0
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        }
      : undefined;

  return {
    width: png.width,
    height: png.height,
    background,
    nonBackgroundPixels,
    nonBackgroundRatio: totalPixels === 0 ? 0 : nonBackgroundPixels / totalPixels,
    nonTransparentPixels,
    nonTransparentRatio: totalPixels === 0 ? 0 : nonTransparentPixels / totalPixels,
    contentBounds,
    contentCoverage: contentBounds ? (contentBounds.width * contentBounds.height) / totalPixels : 0,
    touchesCanvasEdge: contentBounds ? touchesEdge(contentBounds, png.width, png.height) : false
  };
}

export function decodePng(buffer: Buffer): DecodedPng {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new PngDecodeError("Not a PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buffer.length) {
      throw new PngDecodeError("PNG chunk exceeds file length");
    }

    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      interlace = data[12];

      if (compression !== 0 || filter !== 0) {
        throw new PngDecodeError("Unsupported PNG compression or filter method");
      }
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height) {
    throw new PngDecodeError("PNG is missing IHDR dimensions");
  }

  if (bitDepth !== 8) {
    throw new PngDecodeError(`Unsupported PNG bit depth: ${bitDepth}`);
  }

  if (interlace !== 0) {
    throw new PngDecodeError("Interlaced PNGs are not supported");
  }

  const channels = channelsForColorType(colorType);
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const expectedBytes = (rowBytes + 1) * height;

  if (inflated.length < expectedBytes) {
    throw new PngDecodeError("PNG image data is shorter than expected");
  }

  const raw = unfilterScanlines(inflated, width, height, channels);
  const pixels = toRgba(raw, width, height, colorType, palette, transparency);

  return { width, height, pixels };
}

function channelsForColorType(colorType: number): number {
  if (colorType === 0 || colorType === 3) {
    return 1;
  }

  if (colorType === 2) {
    return 3;
  }

  if (colorType === 4) {
    return 2;
  }

  if (colorType === 6) {
    return 4;
  }

  throw new PngDecodeError(`Unsupported PNG color type: ${colorType}`);
}

function unfilterScanlines(data: Buffer, width: number, height: number, channels: number): Uint8Array {
  const rowBytes = width * channels;
  const output = new Uint8Array(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    const inputOffset = y * (rowBytes + 1);
    const outputOffset = y * rowBytes;
    const filterType = data[inputOffset];

    for (let x = 0; x < rowBytes; x += 1) {
      const raw = data[inputOffset + 1 + x];
      const left = x >= channels ? output[outputOffset + x - channels] : 0;
      const up = y > 0 ? output[outputOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= channels ? output[outputOffset + x - rowBytes - channels] : 0;
      output[outputOffset + x] = unfilterByte(filterType, raw, left, up, upperLeft);
    }
  }

  return output;
}

function unfilterByte(filterType: number, raw: number, left: number, up: number, upperLeft: number): number {
  if (filterType === 0) {
    return raw;
  }

  if (filterType === 1) {
    return (raw + left) & 0xff;
  }

  if (filterType === 2) {
    return (raw + up) & 0xff;
  }

  if (filterType === 3) {
    return (raw + Math.floor((left + up) / 2)) & 0xff;
  }

  if (filterType === 4) {
    return (raw + paeth(left, up, upperLeft)) & 0xff;
  }

  throw new PngDecodeError(`Unsupported PNG scanline filter: ${filterType}`);
}

function toRgba(
  raw: Uint8Array,
  width: number,
  height: number,
  colorType: number,
  palette: Buffer | undefined,
  transparency: Buffer | undefined
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const totalPixels = width * height;

  for (let index = 0; index < totalPixels; index += 1) {
    const output = index * 4;

    if (colorType === 0) {
      const gray = raw[index];
      pixels[output] = gray;
      pixels[output + 1] = gray;
      pixels[output + 2] = gray;
      pixels[output + 3] = 255;
    } else if (colorType === 2) {
      const input = index * 3;
      pixels[output] = raw[input];
      pixels[output + 1] = raw[input + 1];
      pixels[output + 2] = raw[input + 2];
      pixels[output + 3] = 255;
    } else if (colorType === 3) {
      if (!palette) {
        throw new PngDecodeError("Indexed PNG is missing PLTE");
      }

      const paletteIndex = raw[index];
      const paletteOffset = paletteIndex * 3;
      pixels[output] = palette[paletteOffset] ?? 0;
      pixels[output + 1] = palette[paletteOffset + 1] ?? 0;
      pixels[output + 2] = palette[paletteOffset + 2] ?? 0;
      pixels[output + 3] = transparency?.[paletteIndex] ?? 255;
    } else if (colorType === 4) {
      const input = index * 2;
      const gray = raw[input];
      pixels[output] = gray;
      pixels[output + 1] = gray;
      pixels[output + 2] = gray;
      pixels[output + 3] = raw[input + 1];
    } else if (colorType === 6) {
      const input = index * 4;
      pixels[output] = raw[input];
      pixels[output + 1] = raw[input + 1];
      pixels[output + 2] = raw[input + 2];
      pixels[output + 3] = raw[input + 3];
    }
  }

  return pixels;
}

function readPixel(pixels: Uint8Array, offset: number): RgbaPixel {
  return {
    r: pixels[offset],
    g: pixels[offset + 1],
    b: pixels[offset + 2],
    a: pixels[offset + 3]
  };
}

function pixelDistance(a: RgbaPixel, b: RgbaPixel): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b), Math.abs(a.a - b.a));
}

function touchesEdge(bounds: { x: number; y: number; width: number; height: number }, canvasWidth: number, canvasHeight: number): boolean {
  return bounds.x === 0 || bounds.y === 0 || bounds.x + bounds.width === canvasWidth || bounds.y + bounds.height === canvasHeight;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  if (upDistance <= upperLeftDistance) {
    return up;
  }

  return upperLeft;
}
