import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/scan_screen.dart';
import '../../shared/widgets.dart';
import '../auth/auth_controller.dart';
import '../inbox/inbox_screen.dart';
import 'hub_providers.dart';

/// Scans a code at the hub. The server works out the move from where the parcel is.
Future<ScanResult> hubScan(Api api, String code, String direction) async {
  try {
    final r = await api.post('/scan', {'tracking': code, 'direction': direction, 'idempotencyKey': const Uuid().v4()});
    if (r['bag'] != null) {
      final b = Bag.fromJson(r['bag'] as Map<String, dynamic>);
      return ScanResult(code, tr('Bag received: {n} parcels', {'n': b.parcels}));
    }
    final p = Parcel.fromJson(r['parcel'] as Map<String, dynamic>);
    return ScanResult(code, tr(statusLabels[p.status] ?? p.status));
  } on ApiException catch (e) {
    return ScanResult(code, e.message, ok: false);
  }
}

class HubHome extends ConsumerWidget {
  const HubHome({super.key});

  void _scan(BuildContext context, WidgetRef ref, String direction) {
    final api = ref.read(apiProvider);
    Navigator.of(context)
        .push(MaterialPageRoute<void>(
          builder: (_) => ScanScreen(
            title: direction == 'in' ? tr('Scan in') : tr('Scan out'),
            hint: direction == 'in' ? tr('Parcels and bags arriving at the hub') : tr('Parcels leaving for another hub'),
            onCode: (c) => hubScan(api, c, direction),
          ),
        ))
        .then((_) => ref.invalidate(hubSummaryProvider));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    final hubId = ref.watch(currentHubIdProvider);
    final summary = ref.watch(hubSummaryProvider);
    if (hubId == null && user.role == 'admin') return const _PickHub();
    return Scaffold(
      appBar: AppBar(
        title: Text(summary.valueOrNull?.name.isNotEmpty == true ? tr(summary.value!.name) : tr('Hub')),
        actions: [
          if (user.role == 'admin') IconButton(tooltip: tr('Change hub'), onPressed: () => ref.read(chosenHubProvider.notifier).state = null, icon: const Icon(Icons.swap_horiz_rounded)),
          const InboxBell(),
          IconButton(tooltip: tr('Settings'), onPressed: () => context.push('/settings'), icon: const Icon(Icons.settings_outlined)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(hubSummaryProvider),
        child: AsyncBody(
          value: summary,
          onRetry: () => ref.invalidate(hubSummaryProvider),
          data: (s) => ListView(padding: const EdgeInsets.all(16), children: [
            Row(children: [
              Expanded(child: _BigAction(icon: Icons.move_to_inbox_rounded, label: tr('Scan in'), color: MasarColors.accent, onTap: () => _scan(context, ref, 'in'))),
              const SizedBox(width: 12),
              Expanded(child: _BigAction(icon: Icons.outbox_rounded, label: tr('Scan out'), color: MasarColors.navy, onTap: () => _scan(context, ref, 'out'))),
            ]),
            SectionTitle(tr('On the floor')),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.1,
              children: [
                StatTile(value: '${s.n('expectedIn')}', label: tr('expected in')),
                StatTile(value: '${s.n('forDelivery')}', label: tr('ready for delivery')),
                StatTile(value: '${s.n('outbound')}', label: tr('to bag for other hubs')),
                StatTile(value: '${s.n('toRetry')}', label: tr('to retry'), color: s.n('toRetry') > 0 ? MasarColors.warn : null),
                StatTile(value: '${s.n('returns')}', label: tr('going back to merchants')),
                StatTile(value: '${s.n('openBags')} / ${s.n('sealedBags')}', label: tr('bags open / sealed'), onTap: () => context.push('/hub/bags')),
              ],
            ),
            SectionTitle(tr('Linehaul')),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => context.push('/hub/bags'), icon: const Icon(Icons.shopping_bag_outlined), label: Text(tr('Bags')))),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton.icon(onPressed: () => context.push('/hub/manifests'), icon: const Icon(Icons.local_shipping_outlined), label: Text(tr('Trucks')))),
            ]),
            const SizedBox(height: 10),
            OutlinedButton.icon(onPressed: () => context.push('/hub/cash'), icon: const Icon(Icons.payments_outlined), label: Text(tr('Courier cash'))),
            if (s.incoming.isNotEmpty) ...[
              SectionTitle(tr('Trucks on their way here')),
              for (final m in s.incoming)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.local_shipping_rounded, color: MasarColors.progress),
                    title: Ltr(m['code'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: m['departedAt'] == null ? null : Text(tr('Left {when}', {'when': ago(DateTime.parse(m['departedAt'] as String).toLocal())})),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => context.push('/hub/manifests/${m['id']}'),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(tr('When the truck arrives, scan each bag in: every parcel inside is received at once.'), style: const TextStyle(color: MasarColors.muted, fontSize: 13)),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

class _BigAction extends StatelessWidget {
  const _BigAction({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: color,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 26),
            child: Column(children: [
              Icon(icon, color: Colors.white, size: 34),
              const SizedBox(height: 8),
              Text(label, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      );
}

class _PickHub extends ConsumerWidget {
  const _PickHub();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hubs = ref.watch(hubsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Choose a hub')), actions: [IconButton(onPressed: () => context.push('/settings'), icon: const Icon(Icons.settings_outlined))]),
      body: AsyncBody(
        value: hubs,
        onRetry: () => ref.invalidate(hubsProvider),
        data: (list) => ListView(children: [
          for (final h in list)
            ListTile(
              leading: const Icon(Icons.warehouse_outlined),
              title: Text(tr(h.name)),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => ref.read(chosenHubProvider.notifier).state = h.id,
            ),
        ]),
      ),
    );
  }
}
