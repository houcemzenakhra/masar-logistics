import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../shared/widgets.dart';

final ordersProvider = FutureProvider.autoDispose<List<Parcel>>((ref) async {
  final res = await ref.read(apiProvider).get('/parcels');
  return (res['parcels'] as List).map((e) => Parcel.fromJson(e as Map<String, dynamic>)).toList();
});

final parcelProvider = FutureProvider.autoDispose.family<Parcel, String>((ref, id) async {
  final res = await ref.read(apiProvider).get('/parcels/$id');
  return Parcel.fromJson(res['parcel'] as Map<String, dynamic>);
});

final wilayasProvider = FutureProvider<List<Wilaya>>((ref) async {
  final res = await ref.read(apiProvider).get('/wilayas');
  return (res['wilayas'] as List).map((e) => Wilaya.fromJson(e as Map<String, dynamic>)).toList();
});

final communesProvider = FutureProvider.family<List<Wilaya>, int>((ref, wilayaId) async {
  final res = await ref.read(apiProvider).get('/wilayas/$wilayaId/communes');
  return (res['communes'] as List).map((e) => Wilaya.fromJson(e as Map<String, dynamic>)).toList();
});

class Wallet {
  const Wallet(this.balance, this.entries);
  final int balance;
  final List<WalletEntry> entries;
}

final walletProvider = FutureProvider.autoDispose<Wallet>((ref) async {
  final res = await ref.read(apiProvider).get('/merchant/wallet');
  return Wallet(
    (res['balance'] as num).toInt(),
    (res['entries'] as List).map((e) => WalletEntry.fromJson(e as Map<String, dynamic>)).toList(),
  );
});

/// Merchant home: orders and wallet tabs, with a button to create an order.
class MerchantShell extends ConsumerStatefulWidget {
  const MerchantShell({super.key});

  @override
  ConsumerState<MerchantShell> createState() => _MerchantShellState();
}

class _MerchantShellState extends ConsumerState<MerchantShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
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
      body: _tab == 0 ? const _OrdersTab() : const _WalletTab(),
      floatingActionButton: _tab == 0
          ? FloatingActionButton.extended(
              onPressed: () async {
                final created = await Navigator.of(context)
                    .push<bool>(MaterialPageRoute(builder: (_) => const NewOrderScreen()));
                if (created == true) ref.invalidate(ordersProvider);
              },
              icon: const Icon(Icons.add_rounded),
              label: const Text('New order'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.inventory_2_outlined), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'Wallet'),
        ],
      ),
    );
  }
}

class _OrdersTab extends ConsumerWidget {
  const _OrdersTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(ordersProvider),
      child: orders.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [
          const SizedBox(height: 80),
          ErrorRetry(message: '$e', onRetry: () => ref.invalidate(ordersProvider)),
        ]),
        data: (list) => list.isEmpty
            ? ListView(children: const [SizedBox(height: 80), EmptyState('No orders yet. Tap New order to create your first one.')])
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final p = list[i];
                  return Card(
                    clipBehavior: Clip.antiAlias,
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      onTap: () => Navigator.of(context)
                          .push(MaterialPageRoute(builder: (_) => ParcelScreen(id: p.id, tracking: p.tracking))),
                      title: Text(p.recipientName, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${p.tracking} · ${p.wilaya}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                          const SizedBox(height: 6),
                          StatusChip(p.status),
                        ]),
                      ),
                      trailing: Text(dzd(p.codAmount), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class ParcelScreen extends ConsumerWidget {
  const ParcelScreen({super.key, required this.id, required this.tracking});
  final String id;
  final String tracking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final parcel = ref.watch(parcelProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(tracking, style: const TextStyle(fontFamily: 'monospace'))),
      body: parcel.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorRetry(message: '$e', onRetry: () => ref.invalidate(parcelProvider(id))),
        data: (p) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text(p.recipientName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                    StatusChip(p.status),
                  ]),
                  const SizedBox(height: 4),
                  Text(p.recipientPhone),
                  Text('${p.address}, ${p.commune}, ${p.wilaya}', style: const TextStyle(color: MasarColors.muted)),
                  const Divider(height: 28),
                  _kv('Cash to collect', dzd(p.codAmount)),
                  _kv('Delivery fee', dzd(p.deliveryFee)),
                  _kv('You receive', dzd(p.codAmount - p.deliveryFee)),
                ]),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('History', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  const SizedBox(height: 8),
                  for (final e in p.events)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.circle, size: 10, color: statusColor(e.status)),
                      minLeadingWidth: 16,
                      title: Text(statusLabels[e.status] ?? e.status, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text([ago(e.at), if (e.hub != null) e.hub!, if (e.note.isNotEmpty) e.note].join(' · ')),
                    ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(k, style: const TextStyle(color: MasarColors.muted)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w600)),
        ]),
      );
}

class _WalletTab extends ConsumerWidget {
  const _WalletTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(walletProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(walletProvider),
      child: wallet.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(children: [
          const SizedBox(height: 80),
          ErrorRetry(message: '$e', onRetry: () => ref.invalidate(walletProvider)),
        ]),
        data: (w) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: MasarColors.navy, borderRadius: BorderRadius.circular(20)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Balance owed to you', style: TextStyle(color: Colors.white60)),
                const SizedBox(height: 6),
                Text(dzd(w.balance),
                    style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w600, letterSpacing: -1)),
              ]),
            ),
            const SizedBox(height: 16),
            if (w.entries.isEmpty) const EmptyState('Entries appear here after your first delivery.'),
            for (final e in w.entries)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: Text(e.memo.isEmpty ? e.kind : e.memo),
                subtitle: Text(ago(e.at)),
                trailing: Text(
                  '${e.amount >= 0 ? '+' : '−'}${money(e.amount.abs())}',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: e.amount >= 0 ? MasarColors.ok : MasarColors.ink,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class NewOrderScreen extends ConsumerStatefulWidget {
  const NewOrderScreen({super.key});

  @override
  ConsumerState<NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends ConsumerState<NewOrderScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _cod = TextEditingController(text: '0');
  final _weight = TextEditingController(text: '1');
  final _contents = TextEditingController();
  int? _wilaya;
  int? _commune;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _phone, _address, _cod, _weight, _contents]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _required(String? v) => (v == null || v.trim().length < 2) ? 'Required' : null;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiProvider).post('/parcels', {
        'recipientName': _name.text.trim(),
        'recipientPhone': _phone.text.trim(),
        'destWilayaId': _wilaya,
        'communeId': _commune,
        'address': _address.text.trim(),
        'codAmount': int.parse(_cod.text),
        'weightKg': double.parse(_weight.text.replaceAll(',', '.')),
        if (_contents.text.trim().isNotEmpty) 'description': _contents.text.trim(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wilayas = ref.watch(wilayasProvider);
    const gap = SizedBox(height: 14);
    return Scaffold(
      appBar: AppBar(title: const Text('New order')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(controller: _name, validator: _required, decoration: const InputDecoration(labelText: 'Recipient name')),
            gap,
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              validator: (v) => RegExp(r'^0[5-7][\d ]{8,12}$').hasMatch(v?.trim() ?? '') ? null : 'Enter a mobile number like 0550 12 34 56',
              decoration: const InputDecoration(labelText: 'Recipient phone', hintText: '0550 12 34 56'),
            ),
            gap,
            wilayas.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => ErrorRetry(message: '$e', onRetry: () => ref.invalidate(wilayasProvider)),
              data: (list) => DropdownButtonFormField<int>(
                initialValue: _wilaya,
                isExpanded: true,
                validator: (v) => v == null ? 'Choose a wilaya' : null,
                decoration: const InputDecoration(labelText: 'Wilaya'),
                items: [
                  for (final w in list)
                    DropdownMenuItem(value: w.id, child: Text('${w.id.toString().padLeft(2, '0')} · ${w.name}')),
                ],
                onChanged: (v) => setState(() {
                  _wilaya = v;
                  _commune = null;
                }),
              ),
            ),
            gap,
            if (_wilaya == null)
              const InputDecorator(
                decoration: InputDecoration(labelText: 'Commune'),
                child: Text('Choose the wilaya first', style: TextStyle(color: MasarColors.muted)),
              )
            else
              ref.watch(communesProvider(_wilaya!)).when(
                    loading: () => const LinearProgressIndicator(),
                    error: (e, _) => ErrorRetry(message: '$e', onRetry: () => ref.invalidate(communesProvider(_wilaya!))),
                    data: (list) => DropdownButtonFormField<int>(
                      key: ValueKey(_wilaya),
                      initialValue: _commune,
                      isExpanded: true,
                      validator: (v) => v == null ? 'Choose a commune' : null,
                      decoration: const InputDecoration(labelText: 'Commune'),
                      items: [for (final c in list) DropdownMenuItem(value: c.id, child: Text(c.name))],
                      onChanged: (v) => setState(() => _commune = v),
                    ),
                  ),
            gap,
            TextFormField(
              controller: _address,
              validator: _required,
              decoration: const InputDecoration(labelText: 'Address', helperText: 'Street, building, or a landmark the courier can find.'),
            ),
            gap,
            Row(children: [
              Expanded(
                child: TextFormField(
                  controller: _cod,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  validator: (v) => int.tryParse(v ?? '') == null ? 'Enter an amount' : null,
                  decoration: const InputDecoration(labelText: 'Cash to collect (DZD)'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _weight,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  validator: (v) {
                    final n = double.tryParse((v ?? '').replaceAll(',', '.'));
                    return (n == null || n <= 0 || n > 70) ? '0.1 to 70 kg' : null;
                  },
                  decoration: const InputDecoration(labelText: 'Weight (kg)'),
                ),
              ),
            ]),
            gap,
            TextFormField(controller: _contents, maxLength: 120, decoration: const InputDecoration(labelText: 'Contents (optional)')),
            if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: const TextStyle(color: MasarColors.danger))),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Creating…' : 'Create order')),
          ],
        ),
      ),
    );
  }
}
