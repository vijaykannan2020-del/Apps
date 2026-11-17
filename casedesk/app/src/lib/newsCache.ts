import { NewsItem, STARTER_NEWS, STARTER_WEB_NEWS } from '../data/news';

let cache: NewsItem[] = STARTER_NEWS;
export const setNewsCache = (items: NewsItem[]) => { cache = items; };
export const getNews = (id: string) => cache.find((n) => n.id === id) ?? [...STARTER_NEWS, ...STARTER_WEB_NEWS].find((n) => n.id === id);
