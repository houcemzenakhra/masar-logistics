/// Build-time settings, passed with --dart-define.
///
///   API_BASE                 the Masar server, e.g. https://masar-staging-seven.vercel.app
///   FIREBASE_API_KEY         \
///   FIREBASE_APP_ID           | from the Firebase console (Project settings > Your apps).
///   FIREBASE_SENDER_ID        | Leave them out and the app works without push: notifications
///   FIREBASE_PROJECT_ID      /  still arrive in the in-app inbox.
class Config {
  /// Android emulator: http://10.0.2.2:3000 is the computer running `npm run dev`.
  static const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:3000');

  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

  static bool get pushConfigured =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty && firebaseSenderId.isNotEmpty && firebaseProjectId.isNotEmpty;

  /// Shown on map tiles, as OpenStreetMap asks.
  static const userAgent = 'dz.masar.masar_mobile';
}
