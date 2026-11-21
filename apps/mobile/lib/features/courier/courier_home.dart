import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/config.dart';
import '../../core/duty.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/outbox.dart';
import '../../core/theme.dart';
import '../../shared/scan_screen.dart';
import '../../shared/widgets.dart';
import '../auth/auth_controller.dart';
import '../inbox/inbox_screen.dart';
import 'courier_providers.dart';

class CourierHome extends ConsumerStatefulWidget {
  const CourierHome({super.key});

  @override
  ConsumerState<CourierHome> createState() => _CourierHomeState();
}

class _CourierHomeState extends ConsumerState<CourierHome> with WidgetsBindingObserver {
  int _tab = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Signal comes and goes on a run: try the queue every two minutes.
    _timer = Timer.periodic(const Duration(minutes: 2), (_) => ref.read(outboxProvider.notifier).flush());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Back in the app: send anything waiting and fetch the latest run.
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final refused = await ref.read(outboxProvider.notifier).flush();
    if (mounted && refused.isNotEmpty) toast(context, refused.join('\n'), error: true);
    ref.invalidate(courierTasksProvider);
    ref.invalidate(receiptsProvider);
    await ref.read(dutyProvider.notifier).flush();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(userProvider);
    final duty = ref.watch(dutyProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Hello {name}', {'name': user.firstName})),
        actions: [
          const InboxBell(),
          IconButton(tooltip: tr('Settings'), onPressed: () => context.push('/settings'), icon: const Icon(Icons.settings_outlined)),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Container(
            color: MasarColors.navy2,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(children: [
              Icon(Icons.my_location_rounded, size: 18, color: duty.onDuty ? MasarColors.accent : Colors.white54),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  duty.error ?? (duty.onDuty ? tr('On duty: your position is shared') : tr('Off duty: position not shared')),
                  style: TextStyle(color: duty.error != null ? const Color(0xFFFFB4A0) : Colors.white70, fontSize: 13),
                ),
              ),
              Switch(
                value: duty.onDuty,
                activeThumbColor: MasarColors.accent,
                onChanged: (v) async {
                  final duty = ref.read(dutyProvider.notifier);
                  if (!v) {
                    await duty.stop();
                    return;
                  }
                  final err = await duty.start();
                  if (err != null && context.mounted) toast(context, err, error: true);
                },
              ),
            ]),
          ),
        ),
      ),
      body: IndexedStack(index: _tab, children: [
        _RunTab(onRefresh: _refresh),
        const _MapTab(),
        _CashTab(onRefresh: _refresh),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.list_alt_rounded), label: tr('Run')),
          NavigationDestination(icon: const Icon(Icons.map_outlined), label: tr('Map')),
          NavigationDestination(icon: const Icon(Icons.payments_outlined), label: tr('Cash')),
        ],
      ),
    );
  }
}

class _RunTab extends ConsumerWidget {
  const _RunTab({required this.onRefresh});
  final Future<void> Function() onRefresh;

  Future<void> _scanPickup(BuildContext context, WidgetRef ref, List<Parcel> pickups) async {
    final code = await scanOnce(context, title: tr('Scan to confirm pickup'));
    if (code == null || !context.mounted) return;
    final p = pickups.where((x) => x.tracking == code).firstOrNull;
    if (p == null) {
      toast(context, tr('{code} is not on your pickup list.', {'code': code}), error: true);
      return;
    }
    final sent = await runAction(context, () => ref.read(courierActionsProvider).pickedUp(p));
    if (sent == null || !context.mounted) return;
    toast(context, sent ? tr('{code} picked up', {'code': p.tracking}) : tr('No signal. Saved on this phone and will be sent later.'));
    ref.invalidate(courierTasksProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(courierTasksProvider);
    final queued = ref.watch(outboxProvider);
    final done = ref.watch(doneLocallyProvider);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: AsyncBody(
        value: tasks,
        onRetry: () => ref.invalidate(courierTasksProvider),
        data: (t) {
          final deliveries = t.deliveries.where((p) => !done.contains(p.id)).toList();
          final pickups = t.pickups.where((p) => !done.contains(p.id)).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            if (queued.isNotEmpty)
              CardBox(
                color: MasarColors.warnSoft,
                child: Row(children: [
                  const Icon(Icons.cloud_upload_outlined, color: MasarColors.warn),
                  const SizedBox(width: 10),
                  Expanded(child: Text(tr('{n} actions saved on this phone, waiting for signal.', {'n': queued.length}), style: const TextStyle(color: MasarColors.warn))),
                  TextButton(onPressed: onRefresh, child: Text(tr('Send now'))),
                ]),
              ),
            if (queued.isNotEmpty) const SizedBox(height: 12),
            Row(children: [
              Expanded(child: StatTile(value: '${deliveries.length}', label: tr('to deliver'))),
              const SizedBox(width: 10),
              Expanded(child: StatTile(value: '${pickups.length}', label: tr('to pick up'))),
              const SizedBox(width: 10),
              Expanded(child: StatTile(value: money(deliveries.fold(0, (a, p) => a + p.codAmount)), label: tr('DZD to collect'))),
            ]),
            if (deliveries.isEmpty && pickups.isEmpty) EmptyState(tr('Nothing assigned to you right now. New jobs appear here as soon as dispatch assigns them.'), icon: Icons.task_alt_rounded),
            if (deliveries.isNotEmpty)
              SectionTitle(
                tr('Deliveries'),
                trailing: deliveries.length > 1
                    ? TextButton.icon(
                        icon: const Icon(Icons.alt_route_rounded, size: 18),
                        label: Text(tr('Plan my route')),
                        onPressed: () async {
                          final r = await runAction(context, () => ref.read(courierActionsProvider).planRoute());
                          if (r == null || !context.mounted) return;
                          toast(context, tr('Route planned: {n} stops, about {km} km', {'n': r['stops'] ?? deliveries.length, 'km': r['km'] ?? '?'}));
                          ref.invalidate(courierTasksProvider);
                        },
                      )
                    : null,
              ),
            for (final p in deliveries) Padding(padding: const EdgeInsets.only(bottom: 10), child: _StopTile(p: p)),
            if (pickups.isNotEmpty)
              SectionTitle(
                tr('Pickups'),
                trailing: TextButton.icon(icon: const Icon(Icons.qr_code_scanner_rounded, size: 18), label: Text(tr('Scan')), onPressed: () => _scanPickup(context, ref, pickups)),
              ),
            for (final p in pickups) Padding(padding: const EdgeInsets.only(bottom: 10), child: _StopTile(p: p, pickup: true)),
          ]);
        },
      ),
    );
  }
}

class _StopTile extends StatelessWidget {
  const _StopTile({required this.p, this.pickup = false});
  final Parcel p;
  final bool pickup;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: MasarColors.line)),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => context.push('/parcel/${p.id}', extra: p),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: pickup ? MasarColors.infoSoft : MasarColors.navy, shape: BoxShape.circle),
              child: pickup
                  ? const Icon(Icons.storefront_rounded, size: 18, color: MasarColors.info)
                  : Text('${p.routeSeq ?? '·'}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(pickup ? p.merchantName : p.recipientName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                const SizedBox(height: 2),
                Text(pickup ? p.tracking : '${p.address}, ${p.place}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: MasarColors.ink2, fontSize: 13.5)),
                if (!pickup && (p.instructions.isNotEmpty || p.preferredDate != null)) ...[
                  const SizedBox(height: 6),
                  Wrap(spacing: 6, runSpacing: 4, children: [
                    if (p.instructions.isNotEmpty) Pill(tr('Note from recipient'), color: MasarColors.info),
                    if (p.preferredDate != null) Pill(tr('Asked for {day}', {'day': p.preferredDate!}), color: MasarColors.warn),
                  ]),
                ],
              ]),
            ),
            if (!pickup && p.codAmount > 0) Ltr(money(p.codAmount), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          ]),
        ),
      ),
    );
  }
}

class _MapTab extends ConsumerWidget {
  const _MapTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(courierTasksProvider).valueOrNull;
    final me = ref.watch(dutyProvider).last;
    final done = ref.watch(doneLocallyProvider);
    final stops = [...?tasks?.deliveries, ...?tasks?.pickups].where((p) => p.hasMapPoint && !done.contains(p.id)).toList();
    final points = <LatLng>[
      for (var i = 0; i < stops.length; i++) LatLng(stops[i].lat! + (i % 5) * 0.0012, stops[i].lng! + (i % 5) * 0.0012),
      if (me != null) LatLng(me.latitude, me.longitude),
    ];
    final initial = points.isEmpty ? const LatLng(36.75, 3.06) : points.first;
    return Stack(children: [
      FlutterMap(
        options: MapOptions(
          initialCenter: initial,
          initialZoom: 11,
          initialCameraFit: points.length > 1 ? CameraFit.coordinates(coordinates: points, padding: const EdgeInsets.all(48), maxZoom: 15) : null,
        ),
        children: [
          TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: Config.userAgent),
          MarkerLayer(markers: [
            for (var i = 0; i < stops.length; i++)
              Marker(
                point: points[i],
                width: 34,
                height: 34,
                child: GestureDetector(
                  onTap: () => context.push('/parcel/${stops[i].id}', extra: stops[i]),
                  child: Container(
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: stops[i].status == 'pickup_assigned' ? MasarColors.info : MasarColors.navy,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: Text(stops[i].status == 'pickup_assigned' ? 'P' : '${stops[i].routeSeq ?? '·'}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                  ),
                ),
              ),
            if (me != null)
              Marker(
                point: LatLng(me.latitude, me.longitude),
                width: 22,
                height: 22,
                child: Container(decoration: BoxDecoration(color: MasarColors.accent, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3))),
              ),
          ]),
          const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
        ],
      ),
      if (stops.isEmpty)
        Positioned(
          left: 16,
          right: 16,
          top: 16,
          child: CardBox(child: Text(tr('Stops appear here once parcels are assigned to you. Each stop sits at the centre of its commune.'))),
        ),
    ]);
  }
}

class _CashTab extends ConsumerWidget {
  const _CashTab({required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(courierTasksProvider);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: AsyncBody(
        value: tasks,
        onRetry: () => ref.invalidate(courierTasksProvider),
        data: (t) => ListView(padding: const EdgeInsets.all(16), children: [
          CardBox(
            color: MasarColors.navy,
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tr('Cash you hold'), style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 6),
              Ltr('${money(t.cash)} ${tr('DZD')}', style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              Text(tr('Hand it in at your hub at the end of the day. The hub records it and this goes back to zero.'), style: const TextStyle(color: Colors.white70, height: 1.4)),
            ]),
          ),
          const SizedBox(height: 12),
          CardBox(
            child: Column(children: [
              InfoRow(tr('Still to collect today'), dzd(t.codToCollect)),
              InfoRow(tr('Parcels with cash to collect'), '${t.deliveries.where((p) => p.codAmount > 0).length}'),
            ]),
          ),
          SectionTitle(tr('Your receipts')),
          ref.watch(receiptsProvider).when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => const SizedBox.shrink(),
                data: (list) => list.isEmpty
                    ? EmptyState(tr('Receipts appear here each time you hand in cash at the hub.'), icon: Icons.receipt_long_outlined)
                    : Column(children: [
                        for (final r in list)
                          Card(
                            margin: const EdgeInsets.only(bottom: 6),
                            child: ListTile(
                              title: Ltr(r.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                              subtitle: Text(dateTime(r.at)),
                              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Ltr(dzd(r.counted), style: const TextStyle(fontWeight: FontWeight.w700)),
                                if (r.difference != 0)
                                  Text(r.difference > 0 ? tr('{x} missing', {'x': dzd(r.difference)}) : tr('{x} extra', {'x': dzd(-r.difference)}), style: TextStyle(fontSize: 12, color: r.difference > 0 ? MasarColors.danger : MasarColors.warn)),
                              ]),
                            ),
                          ),
                      ]),
              ),
        ]),
      ),
    );
  }
}
