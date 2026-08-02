export const SEARCH_TYPE_LABELS: Record<string, string> = {
  web: 'Веб',
  discover: 'Discover',
  news: 'Новости',
  image: 'Картинки',
  video: 'Видео',
};

export function searchTypeLabel(type: string) {
  return SEARCH_TYPE_LABELS[type] || type;
}

export function rangeLabel(days: number) {
  if (days === 1) return '1 день';
  if (days === 7) return '7 дней';
  if (days === 14) return '14 дней';
  if (days === 28) return '28 дней';
  if (days === 90) return '90 дней';
  if (days === 180) return '180 дней';
  if (days === 365) return '1 год';
  if (days === 730) return '2 года';
  if (days >= 365) {
    const years = Math.round(days / 365);
    return years === 1 ? '1 год' : years < 5 ? `${years} года` : `${years} лет`;
  }
  return `${days} дн.`;
}

export function deviceLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'Неизвестно';
  if (normalized === 'desktop') return 'Компьютер';
  if (normalized === 'mobile') return 'Мобильный';
  if (normalized === 'tablet') return 'Планшет';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
