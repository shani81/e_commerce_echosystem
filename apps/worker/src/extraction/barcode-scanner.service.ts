import { Injectable, Logger } from '@nestjs/common';
import { decode as decodeJpeg } from 'jpeg-js';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

// Retail-relevant symbologies (product codes + QR). TRY_HARDER trades a little
// speed for better real-world (phone-filmed) reads.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

/**
 * Decodes product barcodes (EAN/UPC/Code-128/QR…) from sampled shelf frames
 * using the pure-JS ZXing port (no native deps → CI/alpine safe). Results are
 * stored on `ExtractionFrame.barcode` and fed to the vision model as hints, so
 * Gemini can resolve products by GTIN even when packaging text is unclear.
 * Never throws — a frame with no readable barcode just yields null.
 */
@Injectable()
export class BarcodeScannerService {
  private readonly logger = new Logger(BarcodeScannerService.name);
  private readonly reader: MultiFormatReader;

  constructor() {
    this.reader = new MultiFormatReader();
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    this.reader.setHints(hints);
  }

  /** Decode the first barcode in a JPEG frame; null if none / on any error. */
  scan(jpeg: Buffer): string | null {
    let img: { width: number; height: number; data: Uint8Array };
    try {
      img = decodeJpeg(jpeg, { useTArray: true, maxResolutionInMP: 100 });
    } catch {
      return null;
    }
    return this.decodeLuminance(toLuminance(img.data, img.width, img.height), img.width, img.height);
  }

  /** Decode from a grayscale luminance buffer (one byte/pixel). Exposed for tests. */
  decodeLuminance(luminances: Uint8ClampedArray, width: number, height: number): string | null {
    try {
      const source = new RGBLuminanceSource(luminances, width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      const text = this.reader.decode(bitmap).getText();
      return text && text.trim() ? text.trim() : null;
    } catch {
      return null; // NotFoundException when there's no barcode in the frame
    } finally {
      this.reader.reset();
    }
  }
}

/** RGBA bytes → grayscale luminance (BT.601), one byte per pixel. */
export function toLuminance(rgba: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const lum = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    lum[i] = (r * 77 + g * 150 + b * 29) >> 8;
  }
  return lum;
}
