# Masar mobile

One Flutter app for everyone who handles a parcel. The account that signs in decides the screens:

- **Courier:** today's run in route order, on a list and on a map; call, text or navigate to a stop;
  scan to confirm a pickup; deliver with proof (the recipient's 4-digit code, a photo or a
  signature); record a failed attempt with its reason or the day the recipient asked for; cash
  held. Everything works without signal: actions are saved on the phone and sent when it returns,
  each applied once and at the time it really happened. "On duty" shares the courier's position
  with operations and, while their parcel is out for delivery, with the recipient.
- **Hub team** (and operations, who pick a hub): the floor at a glance, continuous scanning in and
  out (a whole bag is received with one scan), bags (scan parcels in, seal) and trucks (load sealed
  bags, depart; the receiving hub is notified).
- **Merchant:** balance and latest orders, orders with search and filters, order detail with
  history and proof of delivery, new order, wallet statement, claims with photos.

Everyone gets a notification inbox. With Firebase settings (below) notifications are also pushed
to the phone; without them the inbox still works.

The app is in Arabic, French and English, right to left in Arabic.

## Get the app

Every push to `main` builds an Android app in GitHub Actions: open the latest **CI** run and
download **masar-android-apk**. It points at the staging server.

## Build it yourself

```bash
cd apps/mobile
bash tool/setup_platforms.sh   # creates android/ and ios/ if missing, adds permissions
flutter pub get
flutter test

# Against the web app on your computer (Android emulator: 10.0.2.2 is your computer)
flutter run --dart-define=API_BASE=http://10.0.2.2:3000

# Against staging
flutter run --dart-define=API_BASE=https://masar-staging-seven.vercel.app
```

The server can also be changed from the sign-in screen, under the address shown at the bottom.

### Push notifications

1. Create a Firebase project and add an Android app with package `dz.masar.masar_mobile`.
2. Build with its settings:
   `--dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_APP_ID=… --dart-define=FIREBASE_SENDER_ID=… --dart-define=FIREBASE_PROJECT_ID=…`
   (in CI, set repository secrets with the same names).
3. On the server, set `FCM_SERVICE_ACCOUNT` to the service account JSON (Project settings >
   Service accounts > Generate new private key). The admin Settings page shows whether it is connected.

## Status

CI runs `flutter analyze`, the tests and a release build on every push. The app has not yet been
tried on a physical phone: check scanning, the camera, on-duty location and push on a real
device before relying on them.
