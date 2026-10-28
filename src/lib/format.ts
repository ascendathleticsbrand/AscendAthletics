/** Shared display helpers for naira amounts, business dates, status labels and prepared WhatsApp links. */
export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
export function label(value: string | null | undefined) {
  return (value || 'pending').replaceAll('_', ' ');
}
export function businessDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' }).format(
        new Date(value),
      )
    : 'Not confirmed';
}
export const whatsappNumber = '2349130607719';
export function whatsapp(message: string, number = whatsappNumber) {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
