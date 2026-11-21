import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';

class InboxState {
  const InboxState({this.items = const [], this.unread = 0});
  final List<AppNotification> items;
  final int unread;
}

/// The person's notifications. Refreshed every minute while the app is open, and at once
/// when a push arrives.
class Inbox extends Notifier<InboxState> {
  Timer? _timer;

  @override
  InboxState build() {
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => refresh());
    ref.onDispose(() => _timer?.cancel());
    Future.microtask(refresh);
    return const InboxState();
  }

  Future<void> refresh() async {
    try {
      final r = await ref.read(apiProvider).get('/notifications');
      state = InboxState(
        items: (r['items'] as List).map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList(),
        unread: (r['unread'] as num).toInt(),
      );
    } on ApiException {
      // Keep what we have; the next tick tries again.
    }
  }

  Future<void> markAllRead() async {
    try {
      await ref.read(apiProvider).post('/notifications/read', {'ids': 'all'});
      await refresh();
    } on ApiException {
      // Not important enough to bother the person.
    }
  }
}

final inboxProvider = NotifierProvider<Inbox, InboxState>(Inbox.new);
