// Guides can be updated from the server (data/content/guides.json) without an app update.
import { useEffect, useState } from 'react';
import { VISAS, Visa, GUIDES_REVIEWED } from '../data/visas';
import { fetchOr } from './api';

let cache: { items: Visa[]; reviewed: string } = { items: VISAS, reviewed: GUIDES_REVIEWED };
let loaded = false;

export function useGuides() {
  const [g, setG] = useState(cache);
  useEffect(() => {
    if (loaded) return;
    fetchOr('/api/content/guides', cache).then((r) => {
      if (r.live && r.data.items?.length) { cache = r.data; loaded = true; setG(r.data); }
    });
  }, []);
  return g;
}
