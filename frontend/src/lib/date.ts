export function formatDistanceToNow(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}y ago`;
}

/**
 * Converts a datetime-local input string (YYYY-MM-DDTHH:mm) to a UTC ISO string
 * for backend submission.
 */
export function datetimeLocalToISO(datetimeLocal: string): string {
  if (!datetimeLocal) return '';
  return new Date(datetimeLocal).toISOString();
}

/**
 * Converts a UTC ISO string or Date object to a datetime-local string (YYYY-MM-DDTHH:mm)
 * for use in <input type="datetime-local">. Uses local timezone.
 */
export function isoToDatetimeLocal(isoString: string | Date): string {
  if (!isoString) return '';
  const dateObj = typeof isoString === 'string' ? new Date(isoString) : isoString;
  
  if (isNaN(dateObj.getTime())) return '';
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
