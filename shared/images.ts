export interface ChatImage {
  mimeType: 'image/png' | 'image/jpeg';
  data: string;
}
export const IMAGE_LIMIT = 4;
export const IMAGE_BYTES = 4 * 1024 * 1024;
export const MESSAGE_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_EDGE = 2048;
