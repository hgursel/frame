import React, { useEffect, useRef, useState } from 'react';
import {
  IMAGE_BYTES,
  IMAGE_EDGE,
  IMAGE_LIMIT,
  MESSAGE_IMAGE_BYTES,
  type ChatImage,
} from '../shared/images.js';
export type DraftImage = ChatImage & { name: string };
export function useChatImages(scope: string) {
  const [images, setImages] = useState<DraftImage[]>([]);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    setImages([]);
  }, [scope]);
  const add = async (files: File[]) => {
    if (!files.length || working.current) return;
    if (files.length + images.length > IMAGE_LIMIT)
      throw new Error('Attach up to four images per message.');
    working.current = true;
    setBusy(true);
    try {
      const added: DraftImage[] = [];
      for (const file of files) {
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          !file.size ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error('Choose PNG, JPEG, or WebP images up to 10 MiB each.');
        const bitmap = await createImageBitmap(file);
        try {
          const scale = Math.min(1, IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Image previews are unavailable in this browser.');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          // Re-encoding strips metadata and keeps screenshots lossless when they fit.
          let url = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
          if (url.length > (IMAGE_BYTES * 4) / 3) url = canvas.toDataURL('image/jpeg', 0.9);
          const [header, data] = url.split(',');
          if (!data || data.length > Math.ceil(IMAGE_BYTES / 3) * 4)
            throw new Error('Image is too large after resizing. Try a smaller crop.');
          added.push({
            name: file.name || 'Pasted image',
            mimeType: header!.includes('image/png') ? 'image/png' : 'image/jpeg',
            data,
          });
        } finally {
          bitmap.close();
        }
      }
      if (
        [...images, ...added].reduce((n, image) => n + image.data.length * 0.75, 0) >
        MESSAGE_IMAGE_BYTES
      )
        throw new Error('Images must total at most 8 MiB per message. Try fewer images.');
      if (currentScope.current === scope) setImages((current) => [...current, ...added]);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return { images, setImages, busy, add };
}
export function ImagePreviews({
  images,
  disabled,
  onRemove,
}: {
  images: DraftImage[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="chat-images draft-images">
      {images.map((image, i) => (
        <figure key={i}>
          <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} />
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove image ${i + 1}`}
            onClick={() => onRemove(i)}
          >
            ×
          </button>
          <figcaption>{image.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}
