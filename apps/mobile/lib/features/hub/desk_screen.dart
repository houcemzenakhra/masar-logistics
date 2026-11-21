import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';
import 'hub_providers.dart';

class DeskCounter {
  const DeskCounter({required this.holdDays, required this.toShelve, required this.onShelf});
  final int holdDays;
  final List<Parcel> toShelve;
  final List<Parcel> onShelf;
}

final deskCounterProvider = FutureProvider.autoDispose<DeskCounter>((ref) async {
  final hubId = ref.watch(currentHubIdProvider);
  final r = await ref.read(apiProvider).get('/hub/desk', query: {if (hubId != null) 'hubId': hubId});
  List<Parcel> list(String k) => ((r[k] as List?) ?? const []).map((e) => Parcel.fromJson(e as Map<String, dynamic>)).toList();
  return DeskCounter(holdDays: (r['holdDays'] as num?)?.toInt() ?? 7, toShelve: list('toShelve'), onShelf: list('onShelf'));
});

/// The hub's stop desk counter: shelve what arrived, hand over against the recipient's code,
/// and send back what nobody came for.
class DeskScreen extends ConsumerWidget {
  const DeskScreen({super.key});

  Future<void> _shelve(BuildContext context, WidgetRef ref, Parcel p) async {
    final r = await runAction(context, () => ref.read(apiProvider).post('/parcels/${p.id}/transition', {'to': 'ready_for_pickup'}), done: tr('On the shelf. The recipient has been told.'));
    if (r != null) ref.invalidate(deskCounterProvider);
  }

  Future<void> _handOver(BuildContext context, WidgetRef ref, Parcel p) async {
    final code = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Hand over {tracking}', {'tracking': p.tracking})),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p.recipientName, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (p.codAmount > 0) Text(tr('Collect {x}', {'x': dzd(p.codAmount)})),
          const SizedBox(height: 12),
          TextField(
            controller: code,
            autofocus: true,
            maxLength: 4,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 26, letterSpacing: 12, fontWeight: FontWeight.w700),
            decoration: InputDecoration(labelText: tr('Code from the recipient\'s text message'), counterText: ''),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Hand over'))),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await runAction(context, () => ref.read(apiProvider).post('/parcels/${p.id}/deliver', {'code': code.text.trim()}), done: tr('Handed over.'));
    if (r != null) ref.invalidate(deskCounterProvider);
  }

  Future<void> _sendBack(BuildContext context, WidgetRef ref, Parcel p, int days) async {
    final r = await runAction(
      context,
      () => ref.read(apiProvider).post('/parcels/${p.id}/transition', {'to': 'return_initiated', 'note': 'Not collected at the stop desk within $days days'}),
      done: tr('Going back to the merchant.'),
    );
    if (r != null) ref.invalidate(deskCounterProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counter = ref.watch(deskCounterProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Stop desk'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(deskCounterProvider),
        child: AsyncBody(
          value: counter,
          onRetry: () => ref.invalidate(deskCounterProvider),
          data: (d) {
            if (d.toShelve.isEmpty && d.onShelf.isEmpty) {
              return ListView(children: [EmptyState(tr('Nothing at the stop desk.'), icon: Icons.storefront_outlined)]);
            }
            return ListView(padding: const EdgeInsets.all(16), children: [
              if (d.toShelve.isNotEmpty) SectionTitle(tr('Arrived for the desk')),
              for (final p in d.toShelve)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Ltr(p.tracking, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${p.recipientName} · ${p.desk ?? ''}'),
                    trailing: FilledButton.tonal(onPressed: () => _shelve(context, ref, p), child: Text(tr('Put on shelf'))),
                  ),
                ),
              if (d.onShelf.isNotEmpty) SectionTitle(tr('On the shelf')),
              for (final p in d.onShelf)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Ltr(p.tracking, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p.recipientName),
                      Text(
                        (p.daysWaiting ?? 0) == 0 ? tr('Today') : tr('{n} days', {'n': p.daysWaiting ?? 0}),
                        style: TextStyle(color: (p.daysWaiting ?? 0) >= d.holdDays ? MasarColors.danger : MasarColors.muted, fontSize: 13),
                      ),
                    ]),
                    trailing: (p.daysWaiting ?? 0) >= d.holdDays
                        ? OutlinedButton(onPressed: () => _sendBack(context, ref, p, d.holdDays), child: Text(tr('Send back')))
                        : FilledButton(onPressed: () => _handOver(context, ref, p), child: Text(tr('Hand over'))),
                    onTap: () => _handOver(context, ref, p),
                  ),
                ),
            ]);
          },
        ),
      ),
    );
  }
}
