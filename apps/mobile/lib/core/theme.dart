import 'package:flutter/material.dart';

class MasarColors {
  static const paper = Color(0xFFF5F3EE);
  static const ink = Color(0xFF12161C);
  static const muted = Color(0xFF747A83);
  static const line = Color(0xFFE6E2D9);
  static const navy = Color(0xFF0C1A26);
  static const accent = Color(0xFFFF5B24);
  static const ok = Color(0xFF17845A);
  static const warn = Color(0xFFA86700);
  static const danger = Color(0xFFC23A3A);
  static const info = Color(0xFF2456C4);
  static const progress = Color(0xFF6A45C2);
}

ThemeData masarTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: MasarColors.accent,
    primary: MasarColors.accent,
    onPrimary: Colors.white,
    surface: Colors.white,
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
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: MasarColors.line),
      ),
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
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: MasarColors.accent.withValues(alpha: 0.14),
    ),
  );
}
