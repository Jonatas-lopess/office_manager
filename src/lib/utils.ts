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

import { type DB } from "@vlcn.io/crsqlite-wasm";

/**
 * Fetches current site identification and max database version from crsqlite.
 * Used during boot sequence and after clean wipes.
 */
export async function getSiteMetadata(db: DB) {
  const [[[siteId, siteIdHex]], [[maxV]]] = await Promise.all([
    db.execA("SELECT crsql_site_id(), hex(crsql_site_id())"),
    db.execA(
      `SELECT max(db_version) FROM crsql_changes WHERE site_id = crsql_site_id()`,
    ),
  ]);

  return {
    siteId: siteId as Uint8Array,
    siteIdHex: siteIdHex as string,
    version: maxV ? BigInt(maxV) : 0n,
  };
}
