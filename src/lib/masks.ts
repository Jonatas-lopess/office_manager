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
  let val = String(value).replace(/\D/g, "");
  if (!val || val === "000") return "R$ 0,00";
  
  const numberValue = (Number(val) / 100).toFixed(2);
  const [integer, decimal] = numberValue.split(".");
  
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${formattedInteger},${decimal}`;
};

export const parseCurrencyToNumber = (value: string) => {
  return Number(value.replace(/\D/g, "")) / 100;
};
