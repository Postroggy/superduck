import { clsx } from "clsx";

export function cn(...inputs: any[]): string {
  return clsx(inputs);
}
