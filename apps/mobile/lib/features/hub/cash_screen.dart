import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class CourierCash {
  const CourierCash(this.id, this.name, this.phone, this.cash);
  final String id;
  final String name;
  final String phone;
  final int cash;
}

final courierCashProvider = FutureProvider.autoDispose<List<CourierCash>>((ref) async {
  final r = await ref.read(apiProvider).get('/hub/couriers');
  return (r['couriers'] as List)
      .map((e) => e as Map<String, dynamic>)
      .map((c) => CourierCash(c['id'] as String, c['name'] as String, (c['phone'] as String?) ?? '', (c['cash'] as num).toInt()))
      .toList();
});

/// Counting the cash each courier hands in. The difference is recorded and a receipt is issued.
class CourierCashScreen extends ConsumerWidget {
  const CourierCashScreen({super.key});

  Future<void> _receive(BuildContext context, WidgetRef ref, CourierCash c) async {
    final amount = TextEditingController();
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Cash from {name}', {'name': c.name})),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('Should hand in: {x}', {'x': dzd(c.cash)})),
          const SizedBox(height: 12),
          TextField(controller: amount, autofocus: true, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], decoration: InputDecoration(labelText: tr('Amount counted (DZD)'))),
          const SizedBox(height: 10),
          TextField(controller: note, decoration: InputDecoration(labelText: tr('Note (optional)'))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Receive'))),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final counted = int.tryParse(amount.text);
    if (counted == null) return;
    final r = await runAction(context, () => ref.read(apiProvider).post('/hub/cash', {'courierId': c.id, 'counted': counted, 'note': note.text}));
    if (r == null || !context.mounted) return;
    final h = r['handover'] as Map<String, dynamic>;
    final diff = (h['difference'] as num).toInt();
    ref.invalidate(courierCashProvider);
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(diff == 0 ? Icons.check_circle_rounded : Icons.warning_amber_rounded, color: diff == 0 ? MasarColors.ok : MasarColors.warn, size: 40),
        title: Text(diff == 0 ? tr('Exact amount') : diff > 0 ? tr('{x} missing', {'x': dzd(diff)}) : tr('{x} extra', {'x': dzd(-diff)})),
        content: Text(tr('Receipt {code}. Print it from the website to sign.', {'code': h['code'] as String})),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Done')))],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(courierCashProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Courier cash'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(courierCashProvider),
        child: AsyncBody(
          value: list,
          onRetry: () => ref.invalidate(courierCashProvider),
          data: (all) {
            final holding = all.where((c) => c.cash != 0).toList();
            if (holding.isEmpty) return ListView(children: [EmptyState(tr('No courier is holding cash.'), icon: Icons.payments_outlined)]);
            return ListView(padding: const EdgeInsets.all(16), children: [
              for (final c in holding)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Ltr(c.phone),
                    trailing: Ltr(dzd(c.cash), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    onTap: () => _receive(context, ref, c),
                  ),
                ),
            ]);
          },
        ),
      ),
    );
  }
}
