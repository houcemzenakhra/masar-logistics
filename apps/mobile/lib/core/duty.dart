import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'i18n.dart';

class DutyState {
  const DutyState({this.onDuty = false, this.last, this.pending = 0, this.error});
  final bool onDuty;
  final Position? last;

  /// Positions waiting to be sent (no signal).
  final int pending;
  final String? error;

  DutyState copy({bool? onDuty, Position? last, int? pending, String? error, bool clearError = false}) =>
      DutyState(onDuty: onDuty ?? this.onDuty, last: last ?? this.last, pending: pending ?? this.pending, error: clearError ? null : (error ?? this.error));
}

/// "On duty": the courier's position is shared with operations and, while a parcel is out for
/// delivery, with its recipient. Positions are sent in batches and kept while offline.
/// On Android a notification stays visible while sharing, as the system requires.
class Duty extends Notifier<DutyState> {
  static const _key = 'masar_on_duty';
  StreamSubscription<Position>? _sub;
  Timer? _timer;
  final _buffer = <Map<String, dynamic>>[];

  @override
  DutyState build() {
    ref.onDispose(_stopStream);
    SharedPreferences.getInstance().then((p) {
      if (p.getBool(_key) ?? false) start();
    });
    return const DutyState();
  }

  /// Returns an error message to show, or null when sharing started.
  Future<String?> start() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return _fail(tr('Turn on location in your phone settings.'));
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      return _fail(tr('Masar needs location access to share your position while on duty. Allow it in the app settings.'));
    }
    final LocationSettings settings = Platform.isAndroid
        ? AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 25,
            intervalDuration: const Duration(seconds: 20),
            foregroundNotificationConfig: ForegroundNotificationConfig(
              notificationTitle: tr('On duty'),
              notificationText: tr('Masar is sharing your position with operations.'),
              enableWakeLock: false,
              setOngoing: true,
            ),
          )
        : AppleSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 25,
            activityType: ActivityType.automotiveNavigation,
            pauseLocationUpdatesAutomatically: true,
            showBackgroundLocationIndicator: true,
          );
    await _sub?.cancel();
    _sub = Geolocator.getPositionStream(locationSettings: settings).listen(_onPosition, onError: (Object e) {
      state = state.copy(error: tr('Location stopped. Turn duty off and on again.'));
    });
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => flush());
    state = state.copy(onDuty: true, clearError: true);
    (await SharedPreferences.getInstance()).setBool(_key, true);
    return null;
  }

  Future<void> stop() async {
    await flush();
    _stopStream();
    state = state.copy(onDuty: false, clearError: true);
    (await SharedPreferences.getInstance()).setBool(_key, false);
  }

  void _stopStream() {
    _sub?.cancel();
    _sub = null;
    _timer?.cancel();
    _timer = null;
  }

  String _fail(String msg) {
    state = state.copy(onDuty: false, error: msg);
    return msg;
  }

  void _onPosition(Position p) {
    _buffer.add({
      'lat': p.latitude,
      'lng': p.longitude,
      'accuracy': p.accuracy,
      'heading': p.heading,
      'speed': p.speed,
      'at': p.timestamp.toUtc().toIso8601String(),
    });
    // Keep the most recent few hours if the phone is offline for long.
    if (_buffer.length > 500) _buffer.removeRange(0, _buffer.length - 500);
    state = state.copy(last: p, pending: _buffer.length);
    if (_buffer.length >= 10) flush();
  }

  Future<void> flush() async {
    if (_buffer.isEmpty) return;
    final batch = List<Map<String, dynamic>>.from(_buffer);
    try {
      await ref.read(apiProvider).post('/courier/location', {'points': batch});
      _buffer.removeRange(0, batch.length.clamp(0, _buffer.length));
      state = state.copy(pending: _buffer.length);
    } on ApiException catch (e) {
      // Offline: keep them. Refused (e.g. signed out): drop them.
      if (!e.offline) _buffer.clear();
      state = state.copy(pending: _buffer.length);
    }
  }
}

final dutyProvider = NotifierProvider<Duty, DutyState>(Duty.new);
