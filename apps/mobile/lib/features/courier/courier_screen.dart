import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../shared/scan_screen.dart';
import '../shared/widgets.dart';

class CourierTasks {
  const CourierTasks({required this.cash, required this.pickups, required this.deliveries});
  final int cash;
  final List<Parcel> pickups;
  final List<Parcel> deliveries;
}

final courierTasksProvider = FutureProvider.autoDispose<CourierTasks>((ref) async {
  final res = await ref.read(apiProvider).get('/courier/tasks');
  List<Parcel> list(String k) => (res[k] as List).map((e) => Parcel.fromJson(e as Map<String, dynamic>)).toList();
  return CourierTasks(
    cash: (res['cashToHandOver'] as num).toInt(),
    pickups: list('pickups'),
    deliveries: list('deliveries'),
  );
});

const _failReasons = [
  'Recipient not answering',
  'Recipient absent',
  'Refused the parcel',
  'Wrong address',
  'Asked to reschedule',
];

class CourierScreen extends ConsumerWidget {
  const CourierScreen({super.key});

  Future<void> _refresh(BuildContext context, WidgetRef ref) async {
    final refused = await ref.read(outboxProvider.notifier).flush();
    if (context.mounted && refused.isNotEmpty) toast(context, refused.join('\n'), error: true);
    ref.invalidate(courierTasksProvider);
  }

  Future<void> _move(BuildContext context, WidgetRef ref, Parcel p, String to, {String? note}) async {
    try {
      final sent = await ref
          .read(outboxProvider.notifier)
          .submit(PendingMove(parcelId: p.id, tracking: p.tracking, to: to, note: note));
      if (!context.mounted) return;
      toast(context, sent ? '${p.tracking} updated' : 'No signal. Saved on this phone and will be sent later.');
      ref.invalidate(courierTasksProvider);
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _fail(BuildContext context, WidgetRef ref, Parcel p) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Why could it not be delivered?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              ),
            ),
            for (final r in _failReasons) ListTile(title: Text(r), onTap: () => Navigator.pop(ctx, r)),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (reason != null && context.mounted) await _move(context, ref, p, 'attempt_failed', note: reason);
  }

  /// Scanning a label confirms the courier is holding the right parcel before pickup.
  Future<void> _scanPickup(BuildContext context, WidgetRef ref, List<Parcel> pickups) async {
    final code = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const ScanScreen()));
    if (code == null || !context.mounted) return;
    final match = pickups.where((p) => p.tracking == code).toList();
    if (match.isEmpty) {
      toast(context, '$code is not on your pickup list', error: true);
      return;
    }
    await _move(context, ref, match.first, 'picked_up');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(courierTasksProvider);
    final queued = ref.watch(outboxProvider);
    final user = ref.watch(authProvider).valueOrNull;
    final hidden = queued.map((m) => m.parcelId).toSet();

    return Scaffold(
      appBar: AppBar(
        title: const MasarLogo(light: true),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => ref.read(authProvider.notifier).signOut(),
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      floatingActionButton: tasks.valueOrNull?.pickups.isNotEmpty == true
          ? FloatingActionButton.extended(
              onPressed: () => _scanPickup(context, ref, tasks.value!.pickups),
              backgroundColor: MasarColors.navy,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Scan pickup'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => _refresh(context, ref),
        child: tasks.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 80),
            ErrorRetry(message: '$e', onRetry: () => _refresh(context, ref)),
          ]),
          data: (t) {
            // Parcels with a move waiting in the outbox are already handled on this phone.
            final deliveries = t.deliveries.where((p) => !hidden.contains(p.id)).toList();
            final pickups = t.pickups.where((p) => !hidden.contains(p.id)).toList();
            return ListView(
              padding: const EdgeInsets.only(bottom: 96),
              children: [
                _Header(name: user?.name ?? '', cash: t.cash, deliveries: deliveries.length, pickups: pickups.length),
                if (queued.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: MasarColors.warn.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      '${queued.length} update${queued.length == 1 ? '' : 's'} waiting for signal. Pull down to send.',
                      style: const TextStyle(color: MasarColors.warn, fontWeight: FontWeight.w600),
                    ),
                  ),
                if (deliveries.isEmpty && pickups.isEmpty)
                  const EmptyState('Nothing assigned to you right now. New jobs appear here when dispatch assigns them.'),
                if (deliveries.isNotEmpty) const _SectionTitle('Deliveries'),
                for (final p in deliveries)
                  _DeliveryCard(
                    parcel: p,
                    onDelivered: () => _move(context, ref, p, 'delivered'),
                    onFailed: () => _fail(context, ref, p),
                  ),
                if (pickups.isNotEmpty) const _SectionTitle('Pickups'),
                for (final p in pickups) _PickupCard(parcel: p, onPicked: () => _move(context, ref, p, 'picked_up')),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.cash, required this.deliveries, required this.pickups});
  final String name;
  final int cash;
  final int deliveries;
  final int pickups;

  @override
  Widget build(BuildContext context) {
    Widget tile(String n, String label) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(14)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(n, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w600)),
              Text(label, style: const TextStyle(color: Colors.white60)),
            ]),
          ),
        );
    return Container(
      color: MasarColors.navy,
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$name · cash to hand over', style: const TextStyle(color: Colors.white60)),
        const SizedBox(height: 4),
        Text(dzd(cash),
            style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w600, letterSpacing: -1)),
        const SizedBox(height: 18),
        Row(children: [tile('$deliveries', 'to deliver'), const SizedBox(width: 12), tile('$pickups', 'to pick up')]),
      ]),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
        child: Text(text.toUpperCase(),
            style: const TextStyle(color: MasarColors.muted, fontWeight: FontWeight.w600, letterSpacing: 0.6, fontSize: 13)),
      );
}

class _DeliveryCard extends StatelessWidget {
  const _DeliveryCard({required this.parcel, required this.onDelivered, required this.onFailed});
  final Parcel parcel;
  final VoidCallback onDelivered;
  final VoidCallback onFailed;

  @override
  Widget build(BuildContext context) {
    final p = parcel;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.recipientName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  Text(p.tracking, style: const TextStyle(fontFamily: 'monospace', color: MasarColors.muted)),
                ]),
              ),
              Text(dzd(p.codAmount), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 12),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.place_outlined, size: 18, color: MasarColors.accent),
              const SizedBox(width: 8),
              Expanded(child: Text('${p.address}, ${p.commune}, ${p.wilaya}')),
            ]),
            TextButton.icon(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: MasarColors.info),
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: p.recipientPhone.replaceAll(' ', ''))),
              icon: const Icon(Icons.call_outlined, size: 18),
              label: Text(p.recipientPhone),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: onDelivered,
              child: Text(p.codAmount > 0 ? 'Delivered · collected ${dzd(p.codAmount)}' : 'Delivered'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: onFailed,
              style: OutlinedButton.styleFrom(foregroundColor: MasarColors.danger),
              child: const Text('Could not deliver'),
            ),
          ]),
        ),
      ),
    );
  }
}

class _PickupCard extends StatelessWidget {
  const _PickupCard({required this.parcel, required this.onPicked});
  final Parcel parcel;
  final VoidCallback onPicked;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(parcel.merchantName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
            Text(parcel.tracking, style: const TextStyle(fontFamily: 'monospace', color: MasarColors.muted)),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: MasarColors.navy),
              onPressed: onPicked,
              child: const Text('Picked up'),
            ),
          ]),
        ),
      ),
    );
  }
}
