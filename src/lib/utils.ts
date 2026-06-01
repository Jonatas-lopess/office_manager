import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeString(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function NIRFvalidator(nirf: string) {
  const numeros = nirf.replace(/\D/g, "");

  if (numeros.length !== 8) return false;
  if (/^(\d)\1{7}$/.test(numeros)) return false;

  const base = numeros.substring(0, 7);
  const dvInformado = parseInt(numeros.charAt(7));

  let soma = 0;
  let peso = 8;

  for (let i = 0; i < 7; i++) {
    soma += parseInt(base.charAt(i)) * peso;
    peso--;
  }

  const resto = soma % 11;
  const dvCalculado = resto === 0 || resto === 1 ? 0 : 11 - resto;

  return dvCalculado === dvInformado;
}
