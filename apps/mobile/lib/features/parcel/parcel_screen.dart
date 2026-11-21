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
import 'parcel_providers.dart';

/// A parcel as merchants, hub teams and operations see it: where it is, money, what happened
/// at the door, and its history.
class ParcelScreen extends ConsumerWidget {
  const ParcelScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(parcelDetailProvider(id));
    final user = ref.watch(userProvider);
    return Scaffold(
      appBar: AppBar(title: data.valueOrNull == null ? Text(tr('Parcel')) : Ltr(data.value!.parcel.tracking)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(parcelDetailProvider(id)),
        child: AsyncBody(
          value: data,
          onRetry: () => ref.invalidate(parcelDetailProvider(id)),
          data: (d) {
            final p = d.parcel;
            final merchant = user.role == 'merchant';
            final openClaim = d.claims.where((c) => c.status != 'rejected').firstOrNull;
            final canClaim = merchant && ['delivered', 'returned', 'lost'].contains(p.status) && openClaim == null;
            return ListView(padding: const EdgeInsets.all(16), children: [
              CardBox(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(p.recipientName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
                    StatusChip(p.status),
                  ]),
                  const SizedBox(height: 4),
                  Text('${p.address}\n${p.place}', style: const TextStyle(color: MasarColors.ink2, height: 1.4)),
                  const SizedBox(height: 8),
                  Ltr(p.recipientPhone, style: const TextStyle(color: MasarColors.muted)),
                  const SizedBox(height: 10),
                  Row(children: [
                    TextButton.icon(
                      icon: const Icon(Icons.link_rounded, size: 18),
                      label: Text(tr('Copy tracking link')),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: '${ref.read(apiProvider).base}/t/${p.tracking}'));
                        toast(context, tr('Link copied. Send it to your customer.'));
                      },
                    ),
                  ]),
                ]),
              ),
              const SizedBox(height: 12),
              CardBox(
                child: Column(children: [
                  InfoRow(tr('Cash to collect'), dzd(p.codAmount)),
                  InfoRow(tr('Delivery fee'), dzd(p.deliveryFee)),
                  if (merchant) InfoRow(p.merchantNet >= 0 ? tr('You receive') : tr('You pay'), dzd(p.merchantNet.abs()), valueStyle: const TextStyle(fontWeight: FontWeight.w700, color: MasarColors.ok)),
                  InfoRow(tr('Fee if returned'), dzd(p.returnFee)),
                  if (!merchant) InfoRow(tr('Merchant'), p.merchantName),
                  if (p.courierName != null) InfoRow(tr('Courier'), p.courierName!),
                  InfoRow(tr('Delivery attempts'), '${p.attempts}'),
                ]),
              ),
              if (d.proofs.isNotEmpty || p.failReason != null || p.preferredDate != null || p.instructions.isNotEmpty || p.rating != null) ...[
                SectionTitle(tr('At the door')),
                CardBox(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (d.proofs.any((x) => x.kind == 'code'))
                      Padding(padding: const EdgeInsets.only(bottom: 8), child: Pill(tr("Recipient's code checked"), color: MasarColors.ok)),
                    if (d.proofs.any((x) => x.kind != 'code'))
                      SizedBox(
                        height: 120,
                        child: ListView(scrollDirection: Axis.horizontal, children: [
                          for (final x in d.proofs.where((x) => x.kind != 'code'))
                            Padding(padding: const EdgeInsetsDirectional.only(end: 10), child: ApiImage('/parcels/${p.id}/proofs/${x.id}', fit: x.kind == 'signature' ? BoxFit.contain : BoxFit.cover)),
                        ]),
                      ),
                    if (d.proofs.isNotEmpty && d.proofs.first.receivedBy.isNotEmpty) InfoRow(tr('Received by'), d.proofs.first.receivedBy),
                    if (p.failReason != null && p.status != 'delivered') InfoRow(tr('Last failed attempt'), tr(failReasons[p.failReason] ?? p.failReason!)),
                    if (p.preferredDate != null && p.status != 'delivered') InfoRow(tr('Recipient asked for'), p.preferredDate!),
                    if (p.instructions.isNotEmpty) InfoRow(tr('Directions from the recipient'), p.instructions),
                    if (p.rating != null) InfoRow(tr('Rating'), '${'★' * p.rating!}${'☆' * (5 - p.rating!)}', valueStyle: const TextStyle(color: MasarColors.warn, fontSize: 16)),
                  ]),
                ),
              ],
              if (d.claims.isNotEmpty) ...[
                SectionTitle(tr('Claims')),
                for (final c in d.claims)
                  Card(
                    child: ListTile(
                      title: Ltr(c.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                      subtitle: Text(tr(claimKinds[c.kind] ?? c.kind)),
                      trailing: Pill(tr(claimStatus[c.status] ?? c.status), color: c.status == 'approved' ? MasarColors.ok : c.status == 'rejected' ? MasarColors.danger : MasarColors.warn),
                      onTap: merchant ? () => context.push('/claims/${c.id}') : null,
                    ),
                  ),
              ],
              if (canClaim) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(icon: const Icon(Icons.support_rounded), label: Text(tr('Report a problem with this parcel')), onPressed: () => context.push('/claims/new?tracking=${p.tracking}')),
              ],
              if (merchant && p.status == 'created') ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: MasarColors.danger),
                  icon: const Icon(Icons.cancel_outlined),
                  label: Text(tr('Cancel this order')),
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: Text(tr('Cancel this order?')),
                        content: Text(tr('The courier will not come for it. This cannot be undone.')),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Keep it'))),
                          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Cancel order'))),
                        ],
                      ),
                    );
                    if (ok != true || !context.mounted) return;
                    final r = await runAction(context, () => ref.read(apiProvider).post('/parcels/${p.id}/transition', {'to': 'cancelled'}), done: tr('Order cancelled'));
                    if (r != null) ref.invalidate(parcelDetailProvider(id));
                  },
                ),
              ],
              SectionTitle(tr('History')),
              CardBox(child: Timeline(p.events)),
            ]);
          },
        ),
      ),
    );
  }
}
