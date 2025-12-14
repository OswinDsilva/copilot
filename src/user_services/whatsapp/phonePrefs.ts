const KEY = 'default_whatsapp_number';

export function getDefaultWhatsAppNumber(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v || '';
  } catch {
    return '';
  }
}

export function setDefaultWhatsAppNumber(num: string): void {
  try {
    if (num) localStorage.setItem(KEY, num);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isValidE164(num: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(num);
}
