/** Whole dinars with thousands separators. Western digits in every language. */
export const money = (n: number) => new Intl.NumberFormat("en-US").format(n);
