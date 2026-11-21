import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';
import '../auth/auth_controller.dart';
import '../inbox/inbox_screen.dart';
import '../parcel/parcel_providers.dart';
import 'merchant_providers.dart';

class MerchantShell extends ConsumerStatefulWidget {
  const MerchantShell({super.key});

  @override
  ConsumerState<MerchantShell> createState() => _MerchantShellState();
}

class _MerchantShellState extends ConsumerState<MerchantShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final titles = [tr('Home'), tr('Orders'), tr('Wallet'), tr('Claims')];
    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_tab]),
        actions: [
          const InboxBell(),
          IconButton(tooltip: tr('Settings'), onPressed: () => context.push('/settings'), icon: const Icon(Icons.settings_outlined)),
        ],
      ),
      floatingActionButton: _tab <= 1
          ? FloatingActionButton.extended(onPressed: () => context.push('/orders/new'), icon: const Icon(Icons.add_rounded), label: Text(tr('New order')))
          : _tab == 3
              ? FloatingActionButton.extended(onPressed: () => context.push('/claims/new'), icon: const Icon(Icons.support_rounded), label: Text(tr('Report a problem')))
              : null,
      body: IndexedStack(index: _tab, children: [
        _HomeTab(onOrders: () => setState(() => _tab = 1)),
        const _OrdersTab(),
        const _WalletTab(),
        const _ClaimsTab(),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: titles[0]),
          NavigationDestination(icon: const Icon(Icons.inventory_2_outlined), selectedIcon: const Icon(Icons.inventory_2_rounded), label: titles[1]),
          NavigationDestination(icon: const Icon(Icons.account_balance_wallet_outlined), selectedIcon: const Icon(Icons.account_balance_wallet_rounded), label: titles[2]),
          NavigationDestination(icon: const Icon(Icons.support_outlined), selectedIcon: const Icon(Icons.support_rounded), label: titles[3]),
        ],
      ),
    );
  }
}

class ParcelTile extends StatelessWidget {
  const ParcelTile(this.p, {super.key});
  final Parcel p;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          title: Row(children: [
            Expanded(child: Text(p.recipientName, style: const TextStyle(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
            StatusChip(p.status),
          ]),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(children: [
              Ltr(p.tracking, style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5)),
              const Text('  ·  '),
              Expanded(child: Text(p.place, overflow: TextOverflow.ellipsis)),
              Ltr(money(p.codAmount), style: const TextStyle(fontWeight: FontWeight.w600, color: MasarColors.ink)),
            ]),
          ),
          onTap: () => context.push('/parcel/${p.id}'),
        ),
      );
}

class _HomeTab extends ConsumerWidget {
  const _HomeTab({required this.onOrders});
  final VoidCallback onOrders;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    final wallet = ref.watch(walletProvider);
    final recent = ref.watch(parcelsProvider((group: 'all', q: '')));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(walletProvider);
        ref.invalidate(parcelsProvider((group: 'all', q: '')));
      },
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 96), children: [
        Text(tr('Hello {name}', {'name': user.firstName}), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
        const SizedBox(height: 14),
        CardBox(
          color: MasarColors.navy,
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tr('Balance owed to you'), style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 6),
            Ltr(wallet.valueOrNull == null ? '—' : dzd(wallet.value!.balance), style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700)),
          ]),
        ),
        const SizedBox(height: 12),
        recent.when(
          loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          error: (e, _) => ErrorRetry(error: e, onRetry: () => ref.invalidate(parcelsProvider((group: 'all', q: '')))),
          data: (list) {
            int count(List<String> s) => list.where((p) => s.contains(p.status)).length;
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: StatTile(value: '${count(statusGroups['active']!)}', label: tr('on their way'), onTap: onOrders)),
                const SizedBox(width: 10),
                Expanded(child: StatTile(value: '${count(['delivered'])}', label: tr('delivered'), color: MasarColors.ok, onTap: onOrders)),
                const SizedBox(width: 10),
                Expanded(child: StatTile(value: '${count(statusGroups['problem']!)}', label: tr('need attention'), color: count(statusGroups['problem']!) > 0 ? MasarColors.warn : null, onTap: onOrders)),
              ]),
              SectionTitle(tr('Latest orders'), trailing: TextButton(onPressed: onOrders, child: Text(tr('See all')))),
              if (list.isEmpty) EmptyState(tr('No orders yet. Create your first one: a courier picks it up from you.'), icon: Icons.inventory_2_outlined),
              for (final p in list.take(6)) ParcelTile(p),
            ]);
          },
        ),
      ]),
    );
  }
}

class _OrdersTab extends ConsumerStatefulWidget {
  const _OrdersTab();

  @override
  ConsumerState<_OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends ConsumerState<_OrdersTab> {
  String _group = 'all';
  String _q = '';
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final key = (group: _group, q: _q);
    final list = ref.watch(parcelsProvider(key));
    const groups = {'all': 'All', 'active': 'On their way', 'problem': 'Need attention', 'delivered': 'Delivered', 'returned': 'Returned or cancelled'};
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          onSubmitted: (v) => setState(() => _q = v),
          decoration: InputDecoration(
            hintText: tr('Tracking number, name or phone'),
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _q.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.clear_rounded),
                    onPressed: () {
                      _search.clear();
                      setState(() => _q = '');
                    },
                  ),
            isDense: true,
          ),
        ),
      ),
      SizedBox(
        height: 48,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), children: [
          for (final g in groups.entries)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: ChoiceChip(
                label: Text(tr(g.value)),
                selected: _group == g.key,
                showCheckmark: false,
                labelStyle: TextStyle(color: _group == g.key ? Colors.white : MasarColors.ink),
                onSelected: (_) => setState(() => _group = g.key),
              ),
            ),
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(parcelsProvider(key)),
          child: AsyncBody(
            value: list,
            onRetry: () => ref.invalidate(parcelsProvider(key)),
            data: (l) => l.isEmpty
                ? ListView(children: [EmptyState(tr('No orders match.'))])
                : ListView.builder(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), itemCount: l.length, itemBuilder: (_, i) => ParcelTile(l[i])),
          ),
        ),
      ),
    ]);
  }
}

const _kindLabels = {'delivery': 'Delivery', 'return_fee': 'Return fee', 'handover': 'Handover', 'payout': 'Payout', 'claim': 'Claim payment', 'courier_pay': 'Courier pay', 'cash_adjustment': 'Cash adjustment'};
const _payoutStatus = {'requested': 'Waiting', 'in_batch': 'In a transfer list', 'paid': 'Paid', 'rejected': 'Refused', 'cancelled': 'Cancelled'};

Future<void> _editAccount(BuildContext context, WidgetRef ref, Map<String, dynamic>? current) async {
  var method = (current?['method'] as String?) ?? 'ccp';
  final account = TextEditingController(text: current?['account'] as String? ?? '');
  final holder = TextEditingController(text: current?['holder'] as String? ?? '');
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => AlertDialog(
        title: Text(tr('Payout account')),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          SegmentedButton<String>(
            segments: [ButtonSegment(value: 'ccp', label: const Text('CCP')), ButtonSegment(value: 'bank', label: Text(tr('Bank (RIB)')))],
            selected: {method},
            onSelectionChanged: (v) => set(() => method = v.first),
          ),
          const SizedBox(height: 12),
          TextField(controller: account, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: tr('Account number'), helperText: method == 'ccp' ? tr('Number and 2-digit key') : tr('20 digits'))),
          const SizedBox(height: 10),
          TextField(controller: holder, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: tr('Account holder'))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Save'))),
        ],
      ),
    ),
  );
  if (ok != true || !context.mounted) return;
  final r = await runAction(context, () => ref.read(apiProvider).post('/merchant/payout-account', {'method': method, 'account': account.text, 'holder': holder.text}), done: tr('Saved.'));
  if (r != null) ref.invalidate(payoutsProvider);
}

Future<void> _request(BuildContext context, WidgetRef ref, Payouts p) async {
  final amount = TextEditingController(text: '${p.available}');
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(tr('Request payout')),
      content: TextField(
        controller: amount,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(labelText: tr('Amount (DZD)'), helperText: tr('Between {min} and {max} DZD', {'min': money(p.minimum), 'max': money(p.available)})),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel'))),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Request'))),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  final r = await runAction(context, () => ref.read(apiProvider).post('/merchant/payouts', {'amount': int.tryParse(amount.text) ?? 0}), done: tr('Requested. Finance sends transfers in batches, usually within two working days.'));
  if (r != null) ref.invalidate(payoutsProvider);
}

class _PayoutCard extends ConsumerWidget {
  const _PayoutCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(payoutsProvider).valueOrNull;
    if (p == null) return const SizedBox.shrink();
    final acc = p.account;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 12),
      CardBox(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InfoRow(tr('Can be requested now'), dzd(p.available), valueStyle: const TextStyle(fontWeight: FontWeight.w700)),
          if (p.pending > 0) InfoRow(tr('Already requested'), dzd(p.pending)),
          if (acc != null) InfoRow(tr('Paid to'), '${acc['method'] == 'ccp' ? 'CCP' : tr('Bank')} ${acc['account']}'),
          const SizedBox(height: 8),
          if (acc == null)
            FilledButton(onPressed: () => _editAccount(context, ref, null), child: Text(tr('Add your payout account')))
          else ...[
            FilledButton(onPressed: p.available >= p.minimum ? () => _request(context, ref, p) : null, child: Text(tr('Request payout'))),
            TextButton(onPressed: () => _editAccount(context, ref, acc), child: Text(tr('Change payout account'))),
          ],
        ]),
      ),
      if (p.requests.isNotEmpty) ...[
        SectionTitle(tr('Payout requests')),
        for (final r in p.requests.take(10))
          Card(
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              title: Ltr(r['code'] as String, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
              subtitle: Text(tr(_payoutStatus[r['status']] ?? '${r['status']}')),
              trailing: Ltr(dzd((r['amount'] as num).toInt()), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
      ],
    ]);
  }
}

class _WalletTab extends ConsumerWidget {
  const _WalletTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final w = ref.watch(walletProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(walletProvider);
        ref.invalidate(payoutsProvider);
      },
      child: AsyncBody(
        value: w,
        onRetry: () => ref.invalidate(walletProvider),
        data: (wallet) => ListView(padding: const EdgeInsets.all(16), children: [
          CardBox(
            color: MasarColors.navy,
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tr('Balance owed to you'), style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 6),
              Ltr(dzd(wallet.balance), style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(tr('Cash collected on your deliveries, minus fees, less what has been paid out to you.'), style: const TextStyle(color: Colors.white70, height: 1.4)),
            ]),
          ),
          const _PayoutCard(),
          SectionTitle(tr('Statement')),
          if (wallet.entries.isEmpty) EmptyState(tr('No entries yet.')),
          for (final e in wallet.entries)
            Card(
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                title: Text(tr(_kindLabels[e.kind] ?? e.kind)),
                subtitle: Text('${dateTime(e.at)} · ${e.memo.replaceAll(RegExp(r'^[A-Za-z ]+'), '').trim()}'),
                trailing: Ltr('${e.amount >= 0 ? '+' : '−'}${money(e.amount.abs())}', style: TextStyle(fontWeight: FontWeight.w700, color: e.amount >= 0 ? MasarColors.ok : MasarColors.ink)),
              ),
            ),
        ]),
      ),
    );
  }
}

class _ClaimsTab extends ConsumerWidget {
  const _ClaimsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claims = ref.watch(claimsProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(claimsProvider),
      child: AsyncBody(
        value: claims,
        onRetry: () => ref.invalidate(claimsProvider),
        data: (list) => list.isEmpty
            ? ListView(children: [EmptyState(tr('No claims. If a parcel is lost or arrives damaged, report it here.'), icon: Icons.support_outlined)])
            : ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
                for (final c in list)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Ltr(c.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                      subtitle: Text('${tr(claimKinds[c.kind] ?? c.kind)} · ${c.tracking} · ${dzd(c.amountRequested)}'),
                      trailing: Pill(tr(claimStatus[c.status] ?? c.status), color: c.status == 'approved' ? MasarColors.ok : c.status == 'rejected' ? MasarColors.danger : MasarColors.warn),
                      onTap: () => context.push('/claims/${c.id}'),
                    ),
                  ),
              ]),
      ),
    );
  }
}
