import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Android emulator: http://10.0.2.2:3000. Real device: your computer's LAN address.
/// Override with `--dart-define=API_BASE=https://your-host`.
const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:3000');

class ApiException implements Exception {
  const ApiException(this.message, {this.offline = false, this.status});
  final String message;

  /// True when the request never reached the server.
  final bool offline;
  final int? status;

  @override
  String toString() => message;
}

class Api {
  Api()
      : _dio = Dio(BaseOptions(
          baseUrl: '$apiBase/api/v1',
          connectTimeout: const Duration(seconds: 8),
          receiveTimeout: const Duration(seconds: 15),
          contentType: 'application/json',
        ));

  final Dio _dio;
  String? token;

  Options get _auth => Options(headers: {if (token != null) 'Authorization': 'Bearer $token'});

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) =>
      _run(() => _dio.get<Map<String, dynamic>>(path, queryParameters: query, options: _auth));

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) =>
      _run(() => _dio.post<Map<String, dynamic>>(path, data: body, options: _auth));

  Future<Map<String, dynamic>> _run(Future<Response<Map<String, dynamic>>> Function() call) async {
    try {
      return (await call()).data ?? const {};
    } on DioException catch (e) {
      final data = e.response?.data;
      if (e.response != null) {
        final msg = data is Map && data['error'] is String ? data['error'] as String : 'Request failed';
        throw ApiException(msg, status: e.response!.statusCode);
      }
      throw const ApiException('No connection to the server', offline: true);
    }
  }
}

final apiProvider = Provider<Api>((_) => Api());

/// One queued parcel move, made while offline.
class PendingMove {
  PendingMove({required this.parcelId, required this.tracking, required this.to, this.note, String? key, DateTime? at})
      : key = key ?? const Uuid().v4(),
        at = at ?? DateTime.now();

  final String parcelId;
  final String tracking;
  final String to;
  final String? note;

  /// Sent as the idempotency key, so a retry is applied once.
  final String key;
  final DateTime at;

  Map<String, dynamic> toJson() =>
      {'parcelId': parcelId, 'tracking': tracking, 'to': to, 'note': note, 'key': key, 'at': at.toIso8601String()};

  factory PendingMove.fromJson(Map<String, dynamic> j) => PendingMove(
        parcelId: j['parcelId'] as String,
        tracking: j['tracking'] as String,
        to: j['to'] as String,
        note: j['note'] as String?,
        key: j['key'] as String,
        at: DateTime.parse(j['at'] as String),
      );
}

/// Courier moves are saved on the device when there is no signal and sent when it returns.
/// The server applies each one once (idempotency key) at the time it really happened (`at`).
class Outbox extends Notifier<List<PendingMove>> {
  static const _prefsKey = 'masar_outbox';

  @override
  List<PendingMove> build() {
    _load();
    return const [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_prefsKey) ?? const [];
    state = raw.map((s) => PendingMove.fromJson(jsonDecode(s) as Map<String, dynamic>)).toList();
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_prefsKey, state.map((m) => jsonEncode(m.toJson())).toList());
  }

  Future<void> _send(PendingMove m) => ref.read(apiProvider).post('/parcels/${m.parcelId}/transition', {
        'to': m.to,
        if (m.note != null) 'note': m.note,
        'idempotencyKey': m.key,
        'at': m.at.toUtc().toIso8601String(),
      });

  /// Returns true when sent now, false when queued for later. Throws when the server refuses it.
  Future<bool> submit(PendingMove m) async {
    try {
      await _send(m);
      return true;
    } on ApiException catch (e) {
      if (!e.offline) rethrow;
      state = [...state, m];
      await _save();
      return false;
    }
  }

  /// Sends everything queued. Moves the server refuses are dropped and returned with the reason.
  Future<List<String>> flush() async {
    final refused = <String>[];
    for (final m in [...state]) {
      try {
        await _send(m);
      } on ApiException catch (e) {
        if (e.offline) break;
        refused.add('${m.tracking}: ${e.message}');
      }
      state = state.where((x) => x.key != m.key).toList();
      await _save();
    }
    return refused;
  }
}

final outboxProvider = NotifierProvider<Outbox, List<PendingMove>>(Outbox.new);
