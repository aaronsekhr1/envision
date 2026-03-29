// ── Database types matching Supabase schema ──

export interface Decision {
  id: number;
  user_id: string;
  name: string;
  status: 'active' | 'decided';
  created_at: string;
  decided_at: string | null;
}

export interface Room {
  id: number;
  decision_id: number;
  name: string;
  mime: string;
  data: string; // base64
}

export interface Option {
  id: number;
  decision_id: number;
  name: string;
  starred: boolean;
  sort_order: number;
  product_url: string | null;
  product_description: string | null;
  created_at: string;
}

export interface OptionPhoto {
  id: number;
  option_id: number;
  mime: string;
  data: string; // base64
}

export interface Rendering {
  id: number;
  decision_id: number;
  option_id: number;
  room_id: number;
  mime: string | null;
  data: string | null; // base64
  warning: string | null;
  error: string | null;
}

export interface VizProject {
  id: number;
  user_id: string;
  name: string;
  room_photo: string | null; // base64
  room_mime: string | null;
  created_at: string;
  updated_at: string;
}

export interface VizCategory {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  options?: VizOption[];
}

export interface VizOption {
  id: number;
  category_id: number;
  name: string;
  photo: string | null; // base64
  mime: string | null;
  sort_order: number;
}

export interface VizRendering {
  id: number;
  project_id: number;
  combination_key: string;
  mime: string | null;
  data: string | null; // base64
  error: string | null;
}

// ── Client-side state types ──

export interface DecisionState {
  decision: Decision;
  rooms: Room[];
  options: Option[];
  photos: Record<number, OptionPhoto[]>; // optionId -> photos
  renderings: Record<string, Rendering>; // "optId-roomId" -> rendering
}

export interface VizState {
  project: VizProject;
  categories: (VizCategory & { options: VizOption[] })[];
  results: Record<string, VizRendering & { loading?: boolean }>; // comboKey -> rendering
}

export type GeminiModel = 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';

export const GEMINI_MODELS: { value: GeminiModel; label: string }[] = [
  { value: 'gemini-2.5-flash-image', label: 'Nano Banana (Flash)' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
  { value: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro (Legacy)' },
];
