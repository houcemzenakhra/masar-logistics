import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/scan_screen.dart';
import '../../shared/widgets.dart';
import 'hub_providers.dart';

Color _bagColor(String s) => switch (s) {
      'open' => MasarColors.info,
      'sealed' => MasarColors.progress,
      'in_transit' => MasarColors.warn,
      _ => MasarColors.ok,
    };

/// Asks for a destination hub other than this one.
Future<Hub?> pickHub(BuildContext context, WidgetRef ref, {required String exclude, required String title}) async {
  final hubs = await ref.read(hubsProvider.future);
  if (!context.mounted) return null;
  return showModalBottomSheet<Hub>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: ListView(shrinkWrap: true, children: [
        Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
        for (final h in hubs.where((h) => h.id != exclude)) ListTile(leading: const Icon(Icons.warehouse_outlined), title: Text(tr(h.name)), onTap: () => Navigator.pop(ctx, h)),
      ]),
    ),
  );
}

class BagsScreen extends ConsumerWidget {
  const BagsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hubId = ref.watch(currentHubIdProvider) ?? '';
    final bags = ref.watch(bagsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Bags'))),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add_rounded),
        label: Text(tr('New bag')),
        onPressed: () async {
          final dest = await pickHub(context, ref, exclude: hubId, title: tr('Where is this bag going?'));
          if (dest == null || !context.mounted) return;
          final r = await runAction(context, () => ref.read(apiProvider).post('/bags', {'destHubId': dest.id, if (ref.read(currentHubIdProvider) != null) 'originHubId': hubId}));
          if (r == null || !context.mounted) return;
          ref.invalidate(bagsProvider);
          context.push('/hub/bags/${(r['bag'] as Map)['id']}');
        },
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(bagsProvider),
        child: AsyncBody(
          value: bags,
          onRetry: () => ref.invalidate(bagsProvider),
          data: (all) {
            final outgoing = all.where((b) => b.originHubId == hubId && (b.status == 'open' || b.status == 'sealed')).toList();
            final incoming = all.where((b) => b.destHubId == hubId && b.status == 'in_transit').toList();
            if (outgoing.isEmpty && incoming.isEmpty) return ListView(children: [EmptyState(tr('No bags in progress. Start one for parcels going to another hub.'), icon: Icons.shopping_bag_outlined)]);
            return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
              if (outgoing.isNotEmpty) SectionTitle(tr('Leaving this hub')),
              for (final b in outgoing) _BagTile(b),
              if (incoming.isNotEmpty) SectionTitle(tr('On their way here')),
              for (final b in incoming) _BagTile(b),
            ]);
          },
        ),
      ),
    );
  }
}

class _BagTile extends StatelessWidget {
  const _BagTile(this.b);
  final Bag b;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card(
          child: ListTile(
            title: Ltr(b.code, style: const TextStyle(fontWeight: FontWeight.w600, fontFamily: 'monospace')),
            subtitle: Text('${tr(b.origin)} → ${tr(b.dest)} · ${tr('{n} parcels', {'n': b.parcels})}'),
            trailing: Pill(tr(bagStatus[b.status] ?? b.status), color: _bagColor(b.status)),
            onTap: () => context.push('/hub/bags/${b.id}'),
          ),
        ),
      );
}

class BagScreen extends ConsumerWidget {
  const BagScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(bagProvider(id));
    final hubId = ref.watch(currentHubIdProvider);
    final api = ref.read(apiProvider);
    Future<void> op(Map<String, dynamic> body, String done) async {
      final r = await runAction(context, () => api.post('/bags/$id', body), done: done);
      if (r != null) {
        ref.invalidate(bagProvider(id));
        ref.invalidate(bagsProvider);
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(data.valueOrNull?.$1.code ?? tr('Bag'))),
      body: AsyncBody(
        value: data,
        onRetry: () => ref.invalidate(bagProvider(id)),
        data: (d) {
          final (bag, parcels) = d;
          return ListView(padding: const EdgeInsets.all(16), children: [
            CardBox(
              child: Column(children: [
                Row(children: [
                  Expanded(child: Text('${tr(bag.origin)} → ${tr(bag.dest)}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
                  Pill(tr(bagStatus[bag.status] ?? bag.status), color: _bagColor(bag.status)),
                ]),
                const SizedBox(height: 8),
                InfoRow(tr('Parcels'), '${bag.parcels}'),
                InfoRow(tr('Cash on delivery inside'), dzd(bag.cod)),
                if (bag.manifestCode != null) InfoRow(tr('Truck'), bag.manifestCode!),
              ]),
            ),
            const SizedBox(height: 12),
            if (bag.status == 'open') ...[
              FilledButton.icon(
                icon: const Icon(Icons.qr_code_scanner_rounded),
                label: Text(tr('Scan parcels into this bag')),
                onPressed: () => Navigator.of(context)
                    .push(MaterialPageRoute<void>(
                      builder: (_) => ScanScreen(
                        title: tr('Into {code}', {'code': bag.code}),
                        onCode: (c) async {
                          try {
                            await api.post('/bags/$id', {'op': 'add', 'tracking': c});
                            return ScanResult(c, tr('Added'));
                          } on ApiException catch (e) {
                            return ScanResult(c, e.message, ok: false);
                          }
                        },
                      ),
                    ))
                    .then((_) => ref.invalidate(bagProvider(id))),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                icon: const Icon(Icons.lock_outline_rounded),
                label: Text(tr('Seal the bag')),
                onPressed: parcels.isEmpty ? null : () => op({'op': 'seal'}, tr('Sealed. Load it on a truck to {hub}.', {'hub': tr(bag.dest)})),
              ),
            ],
            if (bag.status == 'in_transit' && bag.destHubId == hubId)
              FilledButton.icon(icon: const Icon(Icons.move_to_inbox_rounded), label: Text(tr('Receive the bag')), onPressed: () => op({'op': 'receive'}, tr('Received: {n} parcels are at the hub.', {'n': bag.parcels}))),
            SectionTitle(tr('Inside')),
            if (parcels.isEmpty) EmptyState(tr('Empty. Scan parcels for {hub} into it.', {'hub': tr(bag.dest)})),
            for (final p in parcels)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Ltr(p.tracking, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                  subtitle: Text('${p.recipientName} · ${p.place}'),
                  trailing: bag.status == 'open'
                      ? IconButton(tooltip: tr('Take out'), icon: const Icon(Icons.remove_circle_outline, color: MasarColors.danger), onPressed: () => op({'op': 'remove', 'parcelId': p.id}, tr('Taken out')))
                      : null,
                ),
              ),
          ]);
        },
      ),
    );
  }
}

class ManifestsScreen extends ConsumerWidget {
  const ManifestsScreen({super.key});

  Future<void> _create(BuildContext context, WidgetRef ref, String hubId) async {
    final dest = await pickHub(context, ref, exclude: hubId, title: tr('Where is the truck going?'));
    if (dest == null || !context.mounted) return;
    final vehicle = TextEditingController();
    final driver = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Truck to {hub}', {'hub': tr(dest.name)})),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: vehicle, decoration: InputDecoration(labelText: tr('Vehicle plate (optional)'))),
          const SizedBox(height: 10),
          TextField(controller: driver, decoration: InputDecoration(labelText: tr('Driver (optional)'))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Create'))),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await runAction(context, () => ref.read(apiProvider).post('/manifests', {'destHubId': dest.id, 'originHubId': hubId, 'vehicle': vehicle.text, 'driver': driver.text}));
    if (r == null || !context.mounted) return;
    ref.invalidate(manifestsProvider);
    context.push('/hub/manifests/${(r['manifest'] as Map)['id']}');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hubId = ref.watch(currentHubIdProvider) ?? '';
    final list = ref.watch(manifestsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Trucks'))),
      floatingActionButton: FloatingActionButton.extended(icon: const Icon(Icons.add_rounded), label: Text(tr('New truck')), onPressed: () => _create(context, ref, hubId)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(manifestsProvider),
        child: AsyncBody(
          value: list,
          onRetry: () => ref.invalidate(manifestsProvider),
          data: (all) {
            final mine = all.where((m) => (m.originHubId == hubId && m.status != 'arrived') || (m.destHubId == hubId && m.status == 'departed')).toList();
            if (mine.isEmpty) return ListView(children: [EmptyState(tr('No trucks loading or on their way.'), icon: Icons.local_shipping_outlined)]);
            return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
              for (final m in mine)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Ltr(m.code, style: const TextStyle(fontWeight: FontWeight.w600, fontFamily: 'monospace')),
                    subtitle: Text('${tr(m.origin)} → ${tr(m.dest)} · ${tr('{n} bags', {'n': m.bags})}'),
                    trailing: Pill(tr(manifestStatus[m.status] ?? m.status), color: m.status == 'open' ? MasarColors.info : MasarColors.warn),
                    onTap: () => context.push('/hub/manifests/${m.id}'),
                  ),
                ),
            ]);
          },
        ),
      ),
    );
  }
}

class ManifestScreen extends ConsumerWidget {
  const ManifestScreen({super.key, required this.id});
  final String id;

  Future<void> _load(BuildContext context, WidgetRef ref, Manifest m) async {
    final all = await ref.read(bagsProvider.future);
    final ready = all.where((b) => b.status == 'sealed' && b.manifestId == null && b.originHubId == m.originHubId && b.destHubId == m.destHubId).toList();
    if (!context.mounted) return;
    if (ready.isEmpty) {
      toast(context, tr('No sealed bag for {hub} is waiting. Seal a bag first.', {'hub': tr(m.dest)}), error: true);
      return;
    }
    final picked = await showModalBottomSheet<List<String>>(context: context, showDragHandle: true, builder: (_) => _BagPicker(bags: ready));
    if (picked == null || picked.isEmpty || !context.mounted) return;
    final r = await runAction(context, () => ref.read(apiProvider).post('/manifests/$id', {'op': 'add', 'bagIds': picked}), done: tr('Loaded'));
    if (r != null) {
      ref.invalidate(manifestProvider(id));
      ref.invalidate(bagsProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(manifestProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(data.valueOrNull?.$1.code ?? tr('Truck'))),
      body: AsyncBody(
        value: data,
        onRetry: () => ref.invalidate(manifestProvider(id)),
        data: (d) {
          final (m, bags) = d;
          return ListView(padding: const EdgeInsets.all(16), children: [
            CardBox(
              child: Column(children: [
                Row(children: [
                  Expanded(child: Text('${tr(m.origin)} → ${tr(m.dest)}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
                  Pill(tr(manifestStatus[m.status] ?? m.status), color: m.status == 'open' ? MasarColors.info : MasarColors.warn),
                ]),
                const SizedBox(height: 8),
                InfoRow(tr('Bags'), '${m.bags}'),
                InfoRow(tr('Parcels'), '${m.parcels}'),
                if (m.vehicle.isNotEmpty) InfoRow(tr('Vehicle'), m.vehicle),
                if (m.driver.isNotEmpty) InfoRow(tr('Driver'), m.driver),
                if (m.departedAt != null) InfoRow(tr('Left'), dateTime(m.departedAt!)),
              ]),
            ),
            const SizedBox(height: 12),
            if (m.status == 'open') ...[
              OutlinedButton.icon(icon: const Icon(Icons.add_box_outlined), label: Text(tr('Load sealed bags')), onPressed: () => _load(context, ref, m)),
              const SizedBox(height: 10),
              FilledButton.icon(
                icon: const Icon(Icons.local_shipping_rounded),
                label: Text(tr('Truck leaves now')),
                onPressed: bags.isEmpty
                    ? null
                    : () async {
                        final r = await runAction(context, () => ref.read(apiProvider).post('/manifests/$id', {'op': 'depart'}), done: tr('On the road. {hub} has been told.', {'hub': tr(m.dest)}));
                        if (r != null) {
                          ref.invalidate(manifestProvider(id));
                          ref.invalidate(manifestsProvider);
                        }
                      },
              ),
            ],
            if (m.status == 'departed')
              CardBox(color: MasarColors.infoSoft, child: Text(tr('At {hub}, scan each bag in when the truck arrives.', {'hub': tr(m.dest)}), style: const TextStyle(color: MasarColors.info))),
            SectionTitle(tr('Bags on this truck')),
            if (bags.isEmpty) EmptyState(tr('Nothing loaded yet.')),
            for (final b in bags)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Ltr(b.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                  subtitle: Text(tr('{n} parcels', {'n': b.parcels})),
                  trailing: m.status == 'open'
                      ? IconButton(
                          tooltip: tr('Unload'),
                          icon: const Icon(Icons.remove_circle_outline, color: MasarColors.danger),
                          onPressed: () async {
                            final r = await runAction(context, () => ref.read(apiProvider).post('/manifests/$id', {'op': 'remove', 'bagId': b.id}));
                            if (r != null) ref.invalidate(manifestProvider(id));
                          },
                        )
                      : Pill(tr(bagStatus[b.status] ?? b.status), color: _bagColor(b.status)),
                  onTap: () => context.push('/hub/bags/${b.id}'),
                ),
              ),
          ]);
        },
      ),
    );
  }
}

class _BagPicker extends StatefulWidget {
  const _BagPicker({required this.bags});
  final List<Bag> bags;

  @override
  State<_BagPicker> createState() => _BagPickerState();
}

class _BagPickerState extends State<_BagPicker> {
  late final Set<String> _on = widget.bags.map((b) => b.id).toSet();

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(tr('Sealed bags ready'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
          Flexible(
            child: ListView(shrinkWrap: true, children: [
              for (final b in widget.bags)
                CheckboxListTile(
                  value: _on.contains(b.id),
                  onChanged: (v) => setState(() => v == true ? _on.add(b.id) : _on.remove(b.id)),
                  title: Ltr(b.code, style: const TextStyle(fontFamily: 'monospace')),
                  subtitle: Text(tr('{n} parcels', {'n': b.parcels})),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton(onPressed: _on.isEmpty ? null : () => Navigator.pop(context, _on.toList()), child: Text(tr('Load {n} bags', {'n': _on.length}))),
          ),
        ]),
      );
}
