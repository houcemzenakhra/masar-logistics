import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'i18n_ar.dart';
import 'i18n_fr.dart';

/// English text is the key, as on the website. French and Arabic dictionaries hold the rest.
class I18n {
  static String lang = 'en';
  static Map<String, String>? _dict;

  static void use(String l) {
    lang = l;
    _dict = l == 'fr' ? fr : (l == 'ar' ? ar : null);
  }

  static bool get rtl => lang == 'ar';
}

/// Translates `text` and fills `{name}` placeholders.
String tr(String text, [Map<String, Object> vars = const {}]) {
  var s = I18n._dict?[text] ?? text;
  vars.forEach((k, v) => s = s.replaceAll('{$k}', '$v'));
  return s;
}

const supportedLangs = ['en', 'fr', 'ar'];
const langNames = {'en': 'English', 'fr': 'Français', 'ar': 'العربية'};
const _key = 'masar_lang';

/// The app language: chosen in settings, or the phone's language the first time.
class LocaleController extends Notifier<String> {
  @override
  String build() {
    final device = ui.PlatformDispatcher.instance.locale.languageCode;
    final first = supportedLangs.contains(device) ? device : 'fr';
    I18n.use(first);
    _load();
    return first;
  }

  Future<void> _load() async {
    final saved = (await SharedPreferences.getInstance()).getString(_key);
    if (saved != null && supportedLangs.contains(saved) && saved != state) set(saved, persist: false);
  }

  void set(String l, {bool persist = true}) {
    I18n.use(l);
    state = l;
    if (persist) SharedPreferences.getInstance().then((p) => p.setString(_key, l));
  }
}

final localeProvider = NotifierProvider<LocaleController, String>(LocaleController.new);

Locale localeOf(String l) => Locale(l);
