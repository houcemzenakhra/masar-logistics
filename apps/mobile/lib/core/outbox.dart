import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';

/// One request made without signal, kept on the phone until it can be sent.
class QueuedCall {
  QueuedCall({required this.path, required this.body, required this.label, String? key, DateTime? at})
      : key = key ?? const Uuid().v4(),
        at = at ?? DateTime.now();

  final String path;
  final Map<String, dynamic> body;

  /// What the courier sees in the pending list, e.g. the tracking number and the action.
  final String label;

  /// Sent as `idempotencyKey`, so a request that did reach the server is applied once.
  final String key;

  /// When it really happened: the server records that time, not the time it synced.
  final DateTime at;

  Map<String, dynamic> get payload => {...body, 'idempotencyKey': key, 'at': at.toUtc().toIso8601String()};

  Map<String, dynamic> toJson() => {'path': path, 'body': body, 'label': label, 'key': key, 'at': at.toIso8601String()};

  factory QueuedCall.fromJson(Map<String, dynamic> j) => QueuedCall(
        path: j['path'] as String,
        body: (j['body'] as Map).cast<String, dynamic>(),
        label: j['label'] as String,
        key: j['key'] as String,
        at: DateTime.parse(j['at'] as String),
      );
}

/// Courier actions are queued when there is no signal and sent when it returns, in order.
class Outbox extends Notifier<List<QueuedCall>> {
  static const _prefsKey = 'masar_outbox_v2';
  bool _flushing = false;

  @override
  List<QueuedCall> build() {
    _load();
    return const [];
  }

  Future<void> _load() async {
    final raw = (await SharedPreferences.getInstance()).getStringList(_prefsKey) ?? const [];
    state = raw.map((s) => QueuedCall.fromJson(jsonDecode(s) as Map<String, dynamic>)).toList();
  }

  Future<void> _save() async =>
      (await SharedPreferences.getInstance()).setStringList(_prefsKey, state.map((m) => jsonEncode(m.toJson())).toList());

  /// Sends now if possible. Returns true when sent, false when saved for later.
  /// Throws [ApiException] when the server refuses it (wrong code, not allowed…).
  Future<bool> submit(QueuedCall c) async {
    try {
      await ref.read(apiProvider).post(c.path, c.payload);
      return true;
    } on ApiException catch (e) {
      if (!e.offline) rethrow;
      state = [...state, c];
      await _save();
      return false;
    }
  }

  /// Sends everything queued. Refused calls are dropped and returned with the reason.
  Future<List<String>> flush() async {
    if (_flushing || state.isEmpty) return const [];
    _flushing = true;
    final refused = <String>[];
    try {
      for (final c in [...state]) {
        try {
          await ref.read(apiProvider).post(c.path, c.payload);
        } on ApiException catch (e) {
          if (e.offline) break;
          refused.add('${c.label}: ${e.message}');
        }
        state = state.where((x) => x.key != c.key).toList();
        await _save();
      }
    } finally {
      _flushing = false;
    }
    return refused;
  }

  Future<void> clear() async {
    state = const [];
    await _save();
  }
}

final outboxProvider = NotifierProvider<Outbox, List<QueuedCall>>(Outbox.new);
