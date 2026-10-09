export function formatByteSize(
  bytes: number,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "byte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(bytes);
}
