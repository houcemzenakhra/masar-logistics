/**
 * Wording of the text messages, and how many SMS parts a text costs. Pure functions with no
 * database or environment access, so the public website can show the real messages too.
 */
import { money } from "./money";

export type Lang = "fr" | "ar";
export const PARCEL_KINDS = ["out_for_delivery", "attempt_failed", "delivered"] as const;
export type ParcelKind = (typeof PARCEL_KINDS)[number];

/**
 * French messages avoid characters outside the GSM 7-bit alphabet (ê, ç, â, î, ô…), so a message
 * fits in 160 characters per part. Arabic always uses Unicode: 70 characters per part.
 */
const TEMPLATES: Record<ParcelKind, Record<Lang, string>> = {
  out_for_delivery: {
    fr: "Masar: votre colis {merchant} est en livraison aujourd'hui.{cod}{code} Livreur {courier}: {courierPhone}. Suivi: {link}",
    ar: "مسار: طردك من {merchant} في الطريق إليك اليوم.{cod}{code} عامل التوصيل {courier}: {courierPhone}. التتبع: {link}",
  },
  attempt_failed: {
    fr: "Masar: nous n'avons pas pu livrer votre colis {merchant} aujourd'hui. Nous repasserons. Pour changer l'adresse, appelez {merchantPhone}. Suivi: {link}",
    ar: "مسار: لم نتمكن من توصيل طردك من {merchant} اليوم. سنعيد المحاولة. لتغيير العنوان اتصل بـ {merchantPhone}. التتبع: {link}",
  },
  delivered: {
    fr: "Masar: votre colis {merchant} a ete livre. Merci! {link}",
    ar: "مسار: تم تسليم طردك من {merchant}. شكراً! {link}",
  },
};

const COD: Record<Lang, string> = { fr: " Montant a payer: {amount} DA.", ar: " المبلغ المطلوب: {amount} دج." };
/** The four digits the recipient gives the courier at the door, when proof of delivery asks for it. */
const CODE: Record<Lang, string> = { fr: " Code: {code}.", ar: " الرمز: {code}." };
const RESET: Record<Lang, string> = {
  fr: "Masar: pour choisir un nouveau mot de passe, ouvrez {link} (valable {hours} h). Si vous n'avez rien demande, ignorez ce message.",
  ar: "مسار: لاختيار كلمة مرور جديدة افتح {link} (صالح {hours} سا). إذا لم تطلب ذلك تجاهل هذه الرسالة.",
};

const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export type ParcelVars = { tracking: string; merchant: string; merchantPhone: string; cod: number; courier?: string; courierPhone?: string; code?: string };

/**
 * In Arabic text a phone number like "0770 11 22 33" is broken up by the right-to-left layout.
 * Left-to-right marks around it keep it in one piece (two characters each; Arabic is Unicode anyway).
 */
const ltr = (lang: Lang, x: string) => (lang === "ar" && x ? `\u200E${x}\u200E` : x);

/** `base` is the public address of the site, used for the tracking link. */
export function renderParcelSms(kind: ParcelKind, lang: Lang, v: ParcelVars, base: string) {
  return fill(TEMPLATES[kind][lang], {
    merchant: v.merchant,
    merchantPhone: ltr(lang, v.merchantPhone),
    courier: v.courier ?? "",
    courierPhone: ltr(lang, v.courierPhone ?? ""),
    cod: v.cod > 0 ? fill(COD[lang], { amount: money(v.cod) }) : "",
    code: v.code ? fill(CODE[lang], { code: ltr(lang, v.code) }) : "",
    link: `${base}/t/${v.tracking}`,
  });
}

export const renderResetSms = (lang: Lang, link: string, hours: number) => fill(RESET[lang], { link, hours });

// GSM 03.38 basic character set plus the extension table (which counts double).
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

/** How many SMS parts a text costs, which is what providers bill. */
export function segments(text: string): { encoding: "GSM-7" | "UCS-2"; length: number; parts: number } {
  let gsm = true;
  let length = 0;
  for (const ch of text) {
    if (GSM.includes(ch)) length += 1;
    else if (GSM_EXT.includes(ch)) length += 2;
    else gsm = false;
  }
  if (!gsm) {
    const n = [...text].length;
    return { encoding: "UCS-2", length: n, parts: n <= 70 ? 1 : Math.ceil(n / 67) };
  }
  return { encoding: "GSM-7", length, parts: length <= 160 ? 1 : Math.ceil(length / 153) };
}
