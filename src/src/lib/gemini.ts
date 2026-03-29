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
      text: `You are an interior design assistant. Describe this room photo in precise detail:
- Room dimensions and layout (shape, proportions)
- Wall colors, textures, and materials
- Flooring type, color, and pattern
- ALL existing furniture and decor — describe each piece, its position, and approximate size
- Lighting sources and quality (natural light, lamps, overhead)
- Windows, doors, and architectural features
- Any rugs, artwork, plants, or accessories

Be extremely thorough. This description will be used to ensure an image edit preserves every detail of the original room.`,
    },
    { inline_data: { mime_type: roomMime, data: roomData } },
  ];

  const descResponse = await geminiRequest(model, apiKey, descParts, ['TEXT']);
  const roomDesc =
    descResponse?.candidates?.[0]?.content?.parts?.[0]?.text || 'A room interior.';

  // Step 2: Build placement-aware item list
  const itemList = pieces
    .map((p, i) => {
      const placement = p.placement ? ` → PLACEMENT: ${p.placement}` : '';
      return `${i + 1}. "${p.name}"${placement}`;
    })
    .join('\n');

  // Step 2: Generate the edited image
  const editPrompt = `You are a photorealistic interior design renderer. You will edit a room photo to show how specific furniture/decor items would look in the space.

ROOM DESCRIPTION (from analysis of the original photo):
${roomDesc}

ITEMS TO PLACE — place ONLY these items, nothing else:
${itemList}

${productCtx ? `ADDITIONAL CONTEXT: ${productCtx}` : ''}

STRICT RULES — follow ALL of these exactly:
1. Place ONLY the items listed above into the room photo. Do NOT add, remove, replace, or modify ANY other furniture, decor, objects, or architectural features in the room.
2. Each item MUST be placed at its specified PLACEMENT location. If no placement is specified, choose the most natural location for that type of item.
3. Items must look naturally integrated — correct scale relative to the room, proper perspective matching the camera angle, realistic lighting and shadows consistent with the room's light sources.
4. The room's walls, floor, ceiling, windows, doors, trim, and ALL existing furniture/decor NOT listed above must remain COMPLETELY UNCHANGED — pixel-perfect preservation.
5. Output a SINGLE photorealistic photograph of the room with the items placed.
6. Do NOT create a collage, split image, side-by-side comparison, mood board, or any multi-image layout.
7. Do NOT add any text, labels, annotations, borders, watermarks, or UI elements.
8. Preserve the exact camera angle, focal length, and aspect ratio of the original room photo.
9. If an item is a wall treatment (wallpaper, paint, etc.), apply it to the specified wall while keeping all other walls unchanged.
10. If an item is a floor covering (rug, carpet), place it on the floor at the specified location without removing the existing flooring underneath.`;

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
