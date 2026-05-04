function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function formatPhone(phone: string) {
  const digits = phoneDigits(phone);
  const normalized =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (normalized.length !== 10) return phone;
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

export function maskPhone(phone: string) {
  const digits = phoneDigits(phone);
  const lastFour = digits.slice(-4);
  if (!lastFour) return "Hidden number";
  return `***-***-${lastFour}`;
}
