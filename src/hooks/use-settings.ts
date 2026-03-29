'use client';

import { useState, useEffect } from 'react';
import type { GeminiModel } from '@/lib/types';

export function useSettings() {
  const [apiKey, setApiKeyState] = useState('');
  const [model, setModelState] = useState<GeminiModel>('gemini-3.1-flash-image-preview');

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    const savedModel = (localStorage.getItem('gemini_model') || 'gemini-3.1-flash-image-preview') as GeminiModel;
    setApiKeyState(savedKey);
    setModelState(savedModel);
  }, []);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const setModel = (m: GeminiModel) => {
    setModelState(m);
    localStorage.setItem('gemini_model', m);
  };

  return { apiKey, setApiKey, model, setModel };
}
