import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get initials from a name
 * @param name Full name to get initials from
 * @returns Up to 2 characters for the initials
 */
export function getInitials(name: string): string {
  if (!name) return '?';

  const parts = name.split(' ').filter(part => part.length > 0);
  
  if (parts.length === 0) return '?';
  
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
