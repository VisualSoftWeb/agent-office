import { v4 as uuid } from "uuid";

export function generateId(): string {
  return uuid();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max) + "...";
}
