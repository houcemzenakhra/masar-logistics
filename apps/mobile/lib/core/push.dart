import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';
import 'config.dart';

/// Push through Firebase Cloud Messaging, when the app was built with Firebase settings
/// (see [Config]). Without them nothing here runs and notifications stay in the in-app inbox.
bool _ready = false;
String? _token;

/// Taps on a notification, with its data (e.g. `parcelId`), for the router to open.
final pushTaps = StreamController<Map<String, dynamic>>.broadcast();

/// Messages that arrive while the app is open: the app shows them itself.
final pushForeground = StreamController<RemoteMessage>.broadcast();

Future<void> initPush() async {
  if (!Config.pushConfigured || kIsWeb) return;
  try {
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: Config.firebaseApiKey,
        appId: Config.firebaseAppId,
        messagingSenderId: Config.firebaseSenderId,
        projectId: Config.firebaseProjectId,
      ),
    );
    _ready = true;
    FirebaseMessaging.onMessage.listen(pushForeground.add);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => pushTaps.add(m.data));
    final first = await FirebaseMessaging.instance.getInitialMessage();
    if (first != null) pushTaps.add(first.data);
  } catch (e) {
    debugPrint('Push not available: $e');
  }
}

bool get pushReady => _ready;

/// Asks permission (Android 13+, iOS) and registers this phone with the server.
Future<void> registerForPush(Api api, String lang) async {
  if (!_ready) return;
  try {
    final m = FirebaseMessaging.instance;
    final perm = await m.requestPermission();
    if (perm.authorizationStatus == AuthorizationStatus.denied) return;
    _token = await m.getToken();
    if (_token == null) return;
    await api.post('/devices', {'token': _token, 'platform': Platform.isIOS ? 'ios' : 'android', 'lang': lang});
    m.onTokenRefresh.listen((t) {
      _token = t;
      api.post('/devices', {'token': t, 'platform': Platform.isIOS ? 'ios' : 'android', 'lang': lang}).ignore();
    });
  } catch (e) {
    debugPrint('Push registration failed: $e');
  }
}

Future<void> unregisterPush(Api api) async {
  final t = _token;
  if (!_ready || t == null) return;
  try {
    await api.delete('/devices', {'token': t});
  } catch (_) {
    // Signing out works offline too; the server forgets the token when Firebase says it is gone.
  }
}
