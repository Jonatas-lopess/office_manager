export const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

export const maskCNPJ = (value: string) => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

export const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(-\d{4})\d+?$/, "$1");
};

export const maskIncra = (value: string) => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$1")
    .replace(/(-\d{1})\d+?$/, "$1");
};

export const maskNIRF = (value: string) => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{1})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$1")
    .replace(/(-\d{1})\d+?$/, "$1");
};

export const maskCurrency = (value: string | number) => {
  if (typeof value === "number") {
    value = value.toFixed(2).replace(/\D/g, "");
  }
  const val = String(value).replace(/\D/g, "");
  if (!val || val === "000") return "R$ 0,00";
  
  const numberValue = (Number(val) / 100).toFixed(2);
  const [integer, decimal] = numberValue.split(".");
  
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${formattedInteger},${decimal}`;
};

export const parseCurrencyToNumber = (value: string) => {
  return Number(value.replace(/\D/g, "")) / 100;
};

export const maskCurrencyInput = (raw: string): string => {
  if (!raw) return "";

  // 1. Keep only digits and commas
  let v = raw.replace(/[^0-9,]/g, "");
  // 2. Allow only the first comma
  const firstComma = v.indexOf(",");
  if (firstComma !== -1) {
    v = v.slice(0, firstComma + 1) + v.slice(firstComma + 1).replace(/,/g, "");
  }
  // 3. Limit decimal part to 2 digits
  const parts = v.split(",");
  if (parts[1] !== undefined) {
    v = parts[0] + "," + parts[1].slice(0, 2);
  }
  
  if (v === "") return "";
  return `R$ ${v}`;
};

export const parseFreeFormCurrency = (raw: string): number => {
  if (!raw || raw === "") return 0;
  // Remove everything except numbers and comma
  const clean = raw.replace(/[^\d,]/g, "");
  // Replace comma with dot for standard float parsing
  const normalized = clean.replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};
