import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/inbox.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

const _icons = <String, IconData>{
  'jobs': Icons.assignment_rounded,
  'delivered': Icons.check_circle_rounded,
  'failed': Icons.report_rounded,
  'returning': Icons.undo_rounded,
  'returned': Icons.inventory_2_rounded,
  'claim_filed': Icons.support_rounded,
  'claim_approved': Icons.verified_rounded,
  'claim_rejected': Icons.cancel_rounded,
  'manifest': Icons.local_shipping_rounded,
  'recipient': Icons.chat_rounded,
};

/// Where a notification leads when tapped.
String? notificationRoute(Map<String, dynamic> data) {
  if (data['parcelId'] != null) return '/parcel/${data['parcelId']}';
  if (data['claimId'] != null) return '/claims/${data['claimId']}';
  if (data['manifestId'] != null) return '/hub/manifests/${data['manifestId']}';
  if (data['kind'] == 'jobs') return '/';
  return null;
}

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(inboxProvider.notifier).refresh());
  }

  @override
  Widget build(BuildContext context) {
    final inbox = ref.watch(inboxProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Notifications')),
        actions: [
          if (inbox.unread > 0) TextButton(onPressed: () => ref.read(inboxProvider.notifier).markAllRead(), child: Text(tr('Mark all read'), style: const TextStyle(color: Colors.white))),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(inboxProvider.notifier).refresh(),
        child: inbox.items.isEmpty
            ? ListView(children: [EmptyState(tr('Nothing yet. Updates about your parcels appear here.'), icon: Icons.notifications_none_rounded)])
            : ListView.separated(
                itemCount: inbox.items.length,
                separatorBuilder: (_, __) => const Divider(),
                itemBuilder: (_, i) {
                  final n = inbox.items[i];
                  final route = notificationRoute(n.data);
                  return ListTile(
                    tileColor: n.read ? null : MasarColors.accentSoft.withValues(alpha: 0.4),
                    leading: Icon(_icons[n.kind] ?? Icons.notifications_rounded, color: n.read ? MasarColors.muted : MasarColors.accent),
                    title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700)),
                    subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n.body),
                      const SizedBox(height: 2),
                      Text(ago(n.at), style: const TextStyle(fontSize: 12, color: MasarColors.muted)),
                    ]),
                    isThreeLine: true,
                    onTap: route == null ? null : () => context.push(route),
                  );
                },
              ),
      ),
    );
  }
}

/// Bell with the unread count, for app bars.
class InboxBell extends ConsumerWidget {
  const InboxBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(inboxProvider).unread;
    return IconButton(
      tooltip: tr('Notifications'),
      onPressed: () => context.push('/inbox'),
      icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 99 ? '99+' : '$unread'), child: const Icon(Icons.notifications_outlined)),
    );
  }
}
