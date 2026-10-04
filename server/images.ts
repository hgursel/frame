import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  IMAGE_BYTES,
  IMAGE_EDGE,
  IMAGE_LIMIT,
  MESSAGE_IMAGE_BYTES,
  type ChatImage,
} from '../shared/images.js';

export const imageId = (image: ChatImage) =>
  createHash('sha256').update(image.mimeType).update(image.data).digest('hex');
function validImage(image: ChatImage) {
  const bytes = Buffer.from(image.data, 'base64');
  if (bytes.length < 4 || bytes.length > IMAGE_BYTES || bytes.toString('base64') !== image.data)
    return false;
  let width = 0,
    height = 0;
  if (image.mimeType === 'image/png') {
    if (
      bytes.length < 33 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.toString('ascii', 12, 16) !== 'IHDR'
    )
      return false;
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else {
    if (bytes.readUInt16BE(0) !== 0xffd8) return false;
    // Find a JPEG start-of-frame marker without trusting offsets supplied by the file.
    for (let i = 2; i + 3 < bytes.length;) {
      if (bytes[i++] !== 0xff) return false;
      while (bytes[i] === 0xff) i++;
      const marker = bytes[i++];
      if (marker === 0xda || marker === 0xd9 || i + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(i);
      if (length < 2 || i + length > bytes.length) return false;
      if ([0xc0, 0xc1, 0xc2].includes(marker!) && length >= 7) {
        height = bytes.readUInt16BE(i + 3);
        width = bytes.readUInt16BE(i + 5);
        break;
      }
      i += length;
    }
  }
  return width > 0 && height > 0 && width <= IMAGE_EDGE && height <= IMAGE_EDGE;
}
export const imagesSchema = z
  .array(
    z
      .object({
        mimeType: z.enum(['image/png', 'image/jpeg']),
        data: z.string().max(Math.ceil(IMAGE_BYTES / 3) * 4),
      })
      .refine(validImage, 'Invalid image. Use a PNG or JPEG up to 2048 pixels and 4 MiB.'),
  )
  .max(IMAGE_LIMIT)
  .default([])
  .refine(
    (images) =>
      images.reduce((sum, image) => sum + Buffer.byteLength(image.data, 'base64'), 0) <=
      MESSAGE_IMAGE_BYTES,
    'Images must total at most 8 MiB per message.',
  );
