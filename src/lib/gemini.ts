'use client';

import type { GeminiModel } from './types';

export interface GeminiPiece {
  name: string;
  data: string; // base64
  mime: string;
  placement?: string | null; // e.g. "center of room floor", "back wall"
}

interface GeminiResult {
  imageData: string;
  imageMime: string;
  warning?: string;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function geminiRequest(
  model: string,
  apiKey: string,
  parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>,
  modalities: string[]
) {
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: modalities },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (msg.includes('not found') || msg.includes('deprecated')) {
      throw new Error(`Model "${model}" is not available. Try a different model. (${msg})`);
    }
    throw new Error(msg);
  }

  return res.json();
}

export async function callGemini(
  apiKey: string,
  model: GeminiModel,
  pieces: GeminiPiece[],
  roomData: string,
  roomMime: string,
  productCtx?: string
): Promise<GeminiResult> {
  // Step 1: Describe the room (text-only response)
  const descParts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
    {
      text: `You are an interior design assistant. Describe this room photo in detail — layout, colors, existing furniture, flooring, walls, lighting, and any decor. Be specific and thorough. This description will be used to guide an image editing task.`,
    },
    { inline_data: { mime_type: roomMime, data: roomData } },
  ];

  const descResponse = await geminiRequest(model, apiKey, descParts, ['TEXT']);
  const roomDesc =
    descResponse?.candidates?.[0]?.content?.parts?.[0]?.text || 'A room interior.';

  // Step 2: Build placement-aware product description
  const pieceNames = pieces.map((p) => {
    const placement = p.placement ? ` (place at: ${p.placement})` : '';
    return `${p.name}${placement}`;
  });
  const pieceName = pieceNames.join(', ');

  // Step 2: Generate the edited image
  const editPrompt = `You are a photorealistic interior design renderer. You have a room photo and ${pieces.length === 1 ? 'a product image' : 'product images'}.

ROOM DESCRIPTION: ${roomDesc}

TASK: Edit the room photo to naturally incorporate: ${pieceName}. Keep EVERYTHING else in the room exactly the same — same walls, floor, lighting, other furniture, camera angle, and perspective.

${productCtx ? `PRODUCT CONTEXT: ${productCtx}` : ''}

CRITICAL RULES:
- Output a SINGLE photorealistic image of the room
- The product${pieces.length > 1 ? 's' : ''} must look naturally placed — correct scale, perspective, lighting, and shadows
- Do NOT add any furniture or objects other than what is listed above
- Do NOT remove or change any existing furniture in the room
- Do NOT create a collage, split image, or side-by-side comparison
- Do NOT add any text, labels, borders, or watermarks
- Keep the original room photo's aspect ratio and camera angle`;

  const editParts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
    { text: editPrompt },
    ...pieces.map((p) => ({ inline_data: { mime_type: p.mime, data: p.data } })),
    { inline_data: { mime_type: roomMime, data: roomData } },
  ];

  const editResponse = await geminiRequest(model, apiKey, editParts, ['TEXT', 'IMAGE']);

  const candidates = editResponse?.candidates || [];
  if (!candidates.length) {
    const blockReason = editResponse?.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Request blocked: ${blockReason}` : 'No response from model');
  }

  const parts = candidates[0]?.content?.parts || [];
  const imgPart = parts.find(
    (p: Record<string, unknown>) =>
      (p.inlineData as { mimeType?: string })?.mimeType?.startsWith('image/') ||
      (p.inline_data as { mime_type?: string })?.mime_type?.startsWith('image/')
  );

  if (!imgPart) {
    const textPart = parts.find((p: Record<string, unknown>) => p.text);
    throw new Error(
      `No image generated. ${(textPart as { text?: string })?.text?.slice(0, 200) || 'Model returned empty response.'}`
    );
  }

  // Handle both camelCase and snake_case response formats
  const inlineData = (imgPart as Record<string, Record<string, string>>).inlineData || (imgPart as Record<string, Record<string, string>>).inline_data;
  const imageMime = inlineData.mimeType || inlineData.mime_type;
  const imageData = inlineData.data;

  // Check for potential collage
  let warning: string | undefined;
  const textPart = parts.find((p: Record<string, unknown>) => typeof p.text === 'string');
  if (textPart && typeof (textPart as { text: string }).text === 'string' && (textPart as { text: string }).text.toLowerCase().includes('collage')) {
    warning = 'Model may have generated a collage instead of an edit.';
  }

  return { imageData, imageMime, warning };
}

export async function testApiKey(apiKey: string, model: GeminiModel): Promise<string> {
  const response = await geminiRequest(
    model,
    apiKey,
    [{ text: 'Reply with exactly: TEST_OK' }],
    ['TEXT']
  );
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (text.includes('TEST_OK')) return 'API key and model working!';
  return `Model responded but unexpected output: ${text.slice(0, 80)}`;
}
