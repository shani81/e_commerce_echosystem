import { BarcodeFormat, EncodeHintType, MultiFormatWriter } from '@zxing/library';
import { BarcodeScannerService, toLuminance } from './barcode-scanner.service';

// @zxing/library's MultiFormatWriter only encodes QR_CODE (the 1D writers are
// stubbed), so we round-trip a QR to validate the decode path end-to-end. The
// 1D EAN/UPC/Code-128 *readers* are stock ZXing and stay enabled in production.
function qrLuminance(text: string, size: number) {
  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.MARGIN, 4);
  const matrix = new MultiFormatWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints);
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const lum = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      lum[y * width + x] = matrix.get(x, y) ? 0 : 255; // black module → 0, white → 255
    }
  }
  return { lum, width, height };
}

describe('BarcodeScannerService', () => {
  const svc = new BarcodeScannerService();

  it('round-trips a code (encode → decode) — proves the scan path', () => {
    const text = 'AICOS:5901234123457';
    const { lum, width, height } = qrLuminance(text, 240);
    expect(svc.decodeLuminance(lum, width, height)).toBe(text);
  });

  it('returns null when there is no barcode', () => {
    const blank = new Uint8ClampedArray(120 * 120).fill(255);
    expect(svc.decodeLuminance(blank, 120, 120)).toBeNull();
  });

  it('toLuminance() converts RGBA → one grayscale byte per pixel', () => {
    // 2 px: white then black.
    const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]);
    const lum = toLuminance(rgba, 2, 1);
    expect(lum).toHaveLength(2);
    expect(lum[0]).toBeGreaterThan(250);
    expect(lum[1]).toBe(0);
  });
});
