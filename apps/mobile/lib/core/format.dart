import 'i18n.dart';

/// Western digits in every language, as on Algerian labels and invoices. 12500 -> "12,500".
String money(num n) {
  final s = n.abs().round().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}$b';
}

String dzd(num n) => '${money(n)} ${tr('DZD')}';

String ago(DateTime t) {
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 60) return tr('{n} min ago', {'n': d.inMinutes < 1 ? 1 : d.inMinutes});
  if (d.inHours < 24) return tr('{n} h ago', {'n': d.inHours});
  return tr('{n} d ago', {'n': d.inDays});
}

String two(int n) => n.toString().padLeft(2, '0');

const _monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _monthsFr = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const _monthsAr = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

String _month(int m) => (I18n.lang == 'fr' ? _monthsFr : I18n.lang == 'ar' ? _monthsAr : _monthsEn)[m - 1];

/// "21 Nov, 14:05"
String dateTime(DateTime t) => '${t.day} ${_month(t.month)}, ${two(t.hour)}:${two(t.minute)}';

/// "21 Nov 2026"
String dateOnly(DateTime t) => '${t.day} ${_month(t.month)} ${t.year}';

/// YYYY-MM-DD, as the API expects days.
String isoDay(DateTime t) => '${t.year}-${two(t.month)}-${two(t.day)}';
