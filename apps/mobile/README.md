# Masar mobile

One Flutter app with three modes, chosen by the role of the account that signs in:

- **Courier:** run sheet, cash to hand over, scan to confirm pickup, deliver, record a failed attempt.
  Moves made without signal are saved on the phone and sent later.
- **Hub staff:** scan parcels in and out with the camera or by typing the number.
- **Merchant:** orders, order detail and history, new order, wallet.

Stack: Riverpod, go_router, dio, mobile_scanner, flutter_secure_storage.

## Status

The code passes `flutter analyze` on the stable channel in CI with no errors or warnings. It was
written without a device or emulator available, so it has not been run yet: test each mode on a
phone before relying on it. The platform folders are not included; generate them once:

```bash
cd apps/mobile
flutter create . --platforms=android,ios --project-name masar_mobile
flutter pub get
flutter analyze
```

Then add the camera permission for the scanner:

- Android: `<uses-permission android:name="android.permission.CAMERA" />` in `android/app/src/main/AndroidManifest.xml`
- iOS: `NSCameraUsageDescription` in `ios/Runner/Info.plist`

## Run

Start the web app first (`apps/web`, `npm run dev`), then:

```bash
# Android emulator (10.0.2.2 is your computer)
flutter run --dart-define=API_BASE=http://10.0.2.2:3000

# Real device: use your computer's LAN address
flutter run --dart-define=API_BASE=http://192.168.1.20:3000
```

Sign in with the demo accounts from the repository README. Plain `http` to a LAN address needs
cleartext allowed on Android in debug builds; use HTTPS for anything real.
