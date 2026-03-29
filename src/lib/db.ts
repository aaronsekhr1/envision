'use client';

import { createClient } from './supabase-browser';
import type {
  Decision, Room, Option, OptionPhoto, Rendering,
  VizProject, VizCategory, VizOption, VizRendering,
  DecisionState, VizState,
} from './types';

const sb = () => createClient();

// ── Generic CRUD ──

export async function dbInsert<T extends Record<string, unknown>>(
  table: string,
  data: T
): Promise<number> {
  const { data: row, error } = await sb().from(table).insert(data).select('id').single();
  if (error) throw new Error(`Insert into ${table}: ${error.message}`);
  return (row as { id: number }).id;
}

export async function dbGet<T>(table: string, id: number): Promise<T> {
  const { data, error } = await sb().from(table).select('*').eq('id', id).single();
  if (error) throw new Error(`Get from ${table}: ${error.message}`);
  return data as T;
}

export async function dbUpdate(table: string, id: number, updates: Record<string, unknown>) {
  const { error } = await sb().from(table).update(updates).eq('id', id);
  if (error) throw new Error(`Update ${table}: ${error.message}`);
}

export async function dbDelete(table: string, id: number) {
  const { error } = await sb().from(table).delete().eq('id', id);
  if (error) throw new Error(`Delete from ${table}: ${error.message}`);
}

export async function dbQuery<T>(
  table: string,
  field: string,
  value: unknown,
  orderBy?: string
): Promise<T[]> {
  let q = sb().from(table).select('*').eq(field, value);
  if (orderBy) q = q.order(orderBy);
  const { data, error } = await q;
  if (error) throw new Error(`Query ${table}: ${error.message}`);
  return (data || []) as T[];
}

export async function dbDeleteWhere(table: string, field: string, value: unknown) {
  const { error } = await sb().from(table).delete().eq(field, value);
  if (error) throw new Error(`Delete from ${table}: ${error.message}`);
}

// ── Decisions ──

export async function getUserDecisions(userId: string): Promise<Decision[]> {
  const { data, error } = await sb()
    .from('decisions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Decision[];
}

export async function createDecision(userId: string, name: string): Promise<number> {
  return dbInsert('decisions', { user_id: userId, name, status: 'active' });
}

export async function loadDecisionState(decisionId: number): Promise<DecisionState> {
  const decision = await dbGet<Decision>('decisions', decisionId);
  const rooms = await dbQuery<Room>('rooms', 'decision_id', decisionId, 'id');
  const options = await dbQuery<Option>('options', 'decision_id', decisionId, 'sort_order');
  const allRenderings = await dbQuery<Rendering>('renderings', 'decision_id', decisionId);

  // Load photos for each option
  const photos: Record<number, OptionPhoto[]> = {};
  for (const opt of options) {
    photos[opt.id] = await dbQuery<OptionPhoto>('option_photos', 'option_id', opt.id);
  }

  // Build renderings map
  const renderings: Record<string, Rendering> = {};
  for (const r of allRenderings) {
    renderings[`${r.option_id}-${r.room_id}`] = r;
  }

  return { decision, rooms, options, photos, renderings };
}

export async function addRoom(
  decisionId: number,
  name: string,
  mime: string,
  data: string
): Promise<number> {
  return dbInsert('rooms', { decision_id: decisionId, name, mime, data });
}

export async function addOption(
  decisionId: number,
  name: string,
  photos: { mime: string; data: string }[]
): Promise<number> {
  const optId = await dbInsert('options', {
    decision_id: decisionId,
    name,
    starred: false,
    sort_order: 0,
  });
  for (const photo of photos) {
    await dbInsert('option_photos', { option_id: optId, mime: photo.mime, data: photo.data });
  }
  return optId;
}

export async function saveRendering(
  decisionId: number,
  optionId: number,
  roomId: number,
  mime: string | null,
  data: string | null,
  warning?: string | null,
  error?: string | null
): Promise<number> {
  // Delete existing if any
  const existing = await dbQuery<Rendering>('renderings', 'decision_id', decisionId);
  const prev = existing.find((r) => r.option_id === optionId && r.room_id === roomId);
  if (prev) await dbDelete('renderings', prev.id);
  return dbInsert('renderings', {
    decision_id: decisionId,
    option_id: optionId,
    room_id: roomId,
    mime,
    data,
    warning: warning || null,
    error: error || null,
  });
}

export async function removeOption(optionId: number) {
  await dbDeleteWhere('option_photos', 'option_id', optionId);
  await dbDeleteWhere('renderings', 'option_id', optionId);
  await dbDelete('options', optionId);
}

export async function removeRoom(roomId: number) {
  await dbDeleteWhere('renderings', 'room_id', roomId);
  await dbDelete('rooms', roomId);
}

export async function markDecided(decisionId: number) {
  await dbUpdate('decisions', decisionId, {
    status: 'decided',
    decided_at: new Date().toISOString(),
  });
}

// ── Visualizer ──

export async function getUserVizProjects(userId: string): Promise<VizProject[]> {
  const { data, error } = await sb()
    .from('visualizer_projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as VizProject[];
}

export async function createVizProject(userId: string, name: string): Promise<number> {
  return dbInsert('visualizer_projects', { user_id: userId, name });
}

export async function loadVizState(projectId: number): Promise<VizState> {
  const project = await dbGet<VizProject>('visualizer_projects', projectId);
  const categories = await dbQuery<VizCategory>(
    'visualizer_categories',
    'project_id',
    projectId,
    'sort_order'
  );

  // Load options for each category
  for (const cat of categories) {
    cat.options = await dbQuery<VizOption>(
      'visualizer_options',
      'category_id',
      cat.id,
      'sort_order'
    );
  }

  // Load renderings
  const allRenderings = await dbQuery<VizRendering>(
    'visualizer_renderings',
    'project_id',
    projectId
  );
  const results: Record<string, VizRendering> = {};
  for (const r of allRenderings) {
    results[r.combination_key] = r;
  }

  return {
    project,
    categories: categories as (VizCategory & { options: VizOption[] })[],
    results,
  };
}

export async function addVizCategory(projectId: number, name: string, sortOrder: number) {
  return dbInsert('visualizer_categories', { project_id: projectId, name, sort_order: sortOrder });
}

export async function addVizOption(
  categoryId: number,
  name: string,
  photo: string | null,
  mime: string | null,
  sortOrder: number
) {
  return dbInsert('visualizer_options', {
    category_id: categoryId,
    name,
    photo,
    mime,
    sort_order: sortOrder,
  });
}

export async function saveVizRendering(
  projectId: number,
  combinationKey: string,
  mime: string | null,
  data: string | null,
  error?: string | null
) {
  // Delete existing if any
  const existing = await dbQuery<VizRendering>(
    'visualizer_renderings',
    'project_id',
    projectId
  );
  const prev = existing.find((r) => r.combination_key === combinationKey);
  if (prev) await dbDelete('visualizer_renderings', prev.id);
  return dbInsert('visualizer_renderings', {
    project_id: projectId,
    combination_key: combinationKey,
    mime,
    data,
    error: error || null,
  });
}

export async function updateVizRoomPhoto(projectId: number, photo: string, mime: string) {
  await dbUpdate('visualizer_projects', projectId, { room_photo: photo, room_mime: mime });
}
