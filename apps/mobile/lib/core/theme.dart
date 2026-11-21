import 'package:flutter/material.dart';

class MasarColors {
  static const paper = Color(0xFFF4F6F5);
  static const surface = Colors.white;
  static const ink = Color(0xFF12161C);
  static const ink2 = Color(0xFF3D444E);
  static const muted = Color(0xFF747A83);
  static const line = Color(0xFFE3E7E5);
  static const navy = Color(0xFF0C1A26);
  static const navy2 = Color(0xFF152838);
  static const accent = Color(0xFFFF5B24);
  static const accentSoft = Color(0xFFFFE9DF);
  static const ok = Color(0xFF17845A);
  static const okSoft = Color(0xFFDFF3EA);
  static const warn = Color(0xFFA86700);
  static const warnSoft = Color(0xFFFBEDCF);
  static const danger = Color(0xFFC23A3A);
  static const dangerSoft = Color(0xFFFBE3E3);
  static const info = Color(0xFF2456C4);
  static const infoSoft = Color(0xFFE3EBFB);
  static const progress = Color(0xFF6A45C2);
}

ThemeData masarTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: MasarColors.accent,
    primary: MasarColors.accent,
    onPrimary: Colors.white,
    secondary: MasarColors.navy,
    surface: MasarColors.surface,
    onSurface: MasarColors.ink,
    error: MasarColors.danger,
  );
  final radius = BorderRadius.circular(14);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: MasarColors.paper,
    appBarTheme: const AppBarTheme(
      backgroundColor: MasarColors.navy,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: MasarColors.line)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        foregroundColor: MasarColors.ink,
        side: const BorderSide(color: MasarColors.line),
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: MasarColors.line)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: MasarColors.line)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: MasarColors.accent, width: 1.6)),
    ),
    chipTheme: ChipThemeData(
      side: const BorderSide(color: MasarColors.line),
      selectedColor: MasarColors.navy,
      checkmarkColor: Colors.white,
      labelStyle: const TextStyle(fontSize: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: MasarColors.accent.withValues(alpha: 0.14),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
    ),
    dividerTheme: const DividerThemeData(color: MasarColors.line, space: 1),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
