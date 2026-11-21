import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class PickupPlan {
  const PickupPlan({required this.days, required this.bookable, required this.booked});
  final List<int> days;
  final List<String> bookable;
  final List<Map<String, dynamic>> booked;
}

final pickupPlanProvider = FutureProvider.autoDispose<PickupPlan>((ref) async {
  final r = await ref.read(apiProvider).get('/merchant/pickups');
  return PickupPlan(
    days: ((r['days'] as List?) ?? const []).map((e) => (e as num).toInt()).toList(),
    bookable: ((r['bookable'] as List?) ?? const []).cast<String>(),
    booked: ((r['booked'] as List?) ?? const []).cast<Map<String, dynamic>>(),
  );
});

/// Saturday first, as Algerians list the week. Friday has no pickups.
const _workDays = [6, 0, 1, 2, 3, 4];
const _dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

String _dayLabel(String day) {
  final d = DateTime.parse('${day}T12:00:00Z');
  return '${tr(_dayNames[d.weekday % 7])} ${d.day}/${d.month}';
}

/// When a courier comes for the merchant's orders: regular days, and extra days booked ahead.
class PickupsScreen extends ConsumerWidget {
  const PickupsScreen({super.key});

  Future<void> _toggle(BuildContext context, WidgetRef ref, List<int> days, int d) async {
    final next = days.contains(d) ? (days.where((x) => x != d).toList()) : [...days, d];
    final r = await runAction(context, () => ref.read(apiProvider).post('/merchant/pickups', {'days': next}));
    if (r != null) ref.invalidate(pickupPlanProvider);
  }

  Future<void> _book(BuildContext context, WidgetRef ref, List<String> bookable) async {
    String day = bookable.first;
    String window = 'morning';
    final expected = TextEditingController();
    final note = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(tr('Book a pickup'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: day,
              decoration: InputDecoration(labelText: tr('Day')),
              items: [for (final d in bookable) DropdownMenuItem(value: d, child: Text(_dayLabel(d)))],
              onChanged: (v) => set(() => day = v ?? day),
            ),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: [ButtonSegment(value: 'morning', label: Text(tr('Morning'))), ButtonSegment(value: 'afternoon', label: Text(tr('Afternoon')))],
              selected: {window},
              onSelectionChanged: (s) => set(() => window = s.first),
            ),
            const SizedBox(height: 10),
            TextField(controller: expected, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], decoration: InputDecoration(labelText: tr('Parcels to hand over (about)'))),
            const SizedBox(height: 10),
            TextField(controller: note, decoration: InputDecoration(labelText: tr('Note for the courier (optional)'))),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Book'))),
          ]),
        ),
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await runAction(
      context,
      () => ref.read(apiProvider).post('/merchant/pickups', {'day': day, 'window': window, if (int.tryParse(expected.text) != null) 'expected': int.parse(expected.text), if (note.text.trim().isNotEmpty) 'note': note.text.trim()}),
      done: tr('Booked. A courier comes on {day}.', {'day': _dayLabel(day)}),
    );
    if (r != null) ref.invalidate(pickupPlanProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plan = ref.watch(pickupPlanProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Pickups'))),
      floatingActionButton: plan.valueOrNull == null || plan.value!.bookable.isEmpty
          ? null
          : FloatingActionButton.extended(onPressed: () => _book(context, ref, plan.value!.bookable), icon: const Icon(Icons.event_available_rounded), label: Text(tr('Book a pickup'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(pickupPlanProvider),
        child: AsyncBody(
          value: plan,
          onRetry: () => ref.invalidate(pickupPlanProvider),
          data: (p) => ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 96), children: [
            SectionTitle(tr('Regular days')),
            Text(tr('Tick the days a courier should come. With none ticked, a courier comes every day you have new orders.'), style: const TextStyle(color: MasarColors.ink2)),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final d in _workDays)
                FilterChip(label: Text(tr(_dayNames[d])), selected: p.days.contains(d), onSelected: (_) => _toggle(context, ref, p.days, d)),
            ]),
            SectionTitle(tr('Booked')),
            if (p.booked.isEmpty) Text(tr('Nothing booked.'), style: const TextStyle(color: MasarColors.muted)),
            for (final b in p.booked)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text('${_dayLabel(b['day'] as String)} · ${b['window'] == 'afternoon' ? tr('Afternoon') : tr('Morning')}'),
                  subtitle: (b['note'] as String? ?? '').isEmpty ? null : Text(b['note'] as String),
                  trailing: TextButton(
                    onPressed: () async {
                      final r = await runAction(context, () => ref.read(apiProvider).post('/merchant/pickups', {'cancel': b['id']}));
                      if (r != null) ref.invalidate(pickupPlanProvider);
                    },
                    child: Text(tr('Cancel')),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
