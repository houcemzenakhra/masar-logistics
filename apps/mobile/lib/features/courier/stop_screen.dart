import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/scan_screen.dart';
import '../../shared/widgets.dart';
import 'courier_providers.dart';
import 'deliver_screen.dart';

/// One stop on the courier's run: who, where, how much, and the actions at the door.
class StopScreen extends ConsumerWidget {
  const StopScreen({super.key, required this.parcel});
  final Parcel parcel;

  Future<void> _call(String phone) => launchUrl(Uri.parse('tel:${phone.replaceAll(' ', '')}'));
  Future<void> _sms(String phone) => launchUrl(Uri.parse('sms:${phone.replaceAll(' ', '')}'));

  Future<void> _navigate(Parcel p) {
    final q = p.hasMapPoint ? '${p.lat},${p.lng}' : Uri.encodeComponent('${p.address}, ${p.commune}, ${p.wilaya}, Algeria');
    return launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$q'), mode: LaunchMode.externalApplication);
  }

  void _done(BuildContext context, WidgetRef ref, bool sent, String what) {
    toast(context, sent ? what : tr('No signal. Saved on this phone and will be sent later.'));
    ref.invalidate(courierTasksProvider);
    Navigator.of(context).pop();
  }

  Future<void> _pickup(BuildContext context, WidgetRef ref) async {
    final code = await scanOnce(context, title: tr('Scan to confirm pickup'));
    if (code == null || !context.mounted) return;
    if (code != parcel.tracking) {
      toast(context, tr('That label is {code}, not {tracking}.', {'code': code, 'tracking': parcel.tracking}), error: true);
      return;
    }
    final sent = await runAction(context, () => ref.read(courierActionsProvider).pickedUp(parcel));
    if (sent != null && context.mounted) _done(context, ref, sent, tr('{code} picked up', {'code': parcel.tracking}));
  }

  Future<void> _deliver(BuildContext context, WidgetRef ref) async {
    final required = ref.read(courierTasksProvider).valueOrNull?.proofRequired ?? false;
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => DeliverScreen(parcel: parcel, proofRequired: required)));
    if (sent != null && context.mounted) _done(context, ref, sent, tr('{code} delivered', {'code': parcel.tracking}));
  }

  Future<void> _fail(BuildContext context, WidgetRef ref) async {
    final r = await showModalBottomSheet<_Fail>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _FailSheet());
    if (r == null || !context.mounted) return;
    final sent = await runAction(context, () => ref.read(courierActionsProvider).fail(parcel, r.reason, note: r.note, day: r.day));
    if (sent != null && context.mounted) _done(context, ref, sent, tr('Failed attempt recorded'));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = parcel;
    final pickup = p.status == 'pickup_assigned';
    return Scaffold(
      appBar: AppBar(title: Ltr(p.tracking)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        CardBox(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(pickup ? p.merchantName : p.recipientName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
              StatusChip(p.status),
            ]),
            const SizedBox(height: 6),
            Text('${p.address}\n${p.place}', style: const TextStyle(color: MasarColors.ink2, height: 1.4)),
            if (!pickup) ...[
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: OutlinedButton.icon(onPressed: () => _call(p.recipientPhone), icon: const Icon(Icons.call_rounded), label: Text(tr('Call')))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton.icon(onPressed: () => _sms(p.recipientPhone), icon: const Icon(Icons.sms_outlined), label: Text(tr('Text')))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton.icon(onPressed: () => _navigate(p), icon: const Icon(Icons.navigation_rounded), label: Text(tr('Go')))),
              ]),
              const SizedBox(height: 6),
              Center(child: Ltr(p.recipientPhone, style: const TextStyle(color: MasarColors.muted))),
            ],
          ]),
        ),
        if (p.instructions.isNotEmpty) ...[
          const SizedBox(height: 12),
          CardBox(
            color: MasarColors.infoSoft,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.chat_bubble_outline_rounded, color: MasarColors.info),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(tr('Note from the recipient'), style: const TextStyle(color: MasarColors.info, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(p.instructions),
                ]),
              ),
            ]),
          ),
        ],
        if (p.preferredDate != null) ...[
          const SizedBox(height: 12),
          CardBox(
            color: MasarColors.warnSoft,
            child: Row(children: [
              const Icon(Icons.event_rounded, color: MasarColors.warn),
              const SizedBox(width: 10),
              Expanded(child: Text(tr('The recipient asked to be delivered on {day}.', {'day': p.preferredDate!}), style: const TextStyle(color: MasarColors.warn))),
            ]),
          ),
        ],
        const SizedBox(height: 12),
        CardBox(
          child: Column(children: [
            if (!pickup) InfoRow(tr('Cash to collect'), dzd(p.codAmount), valueStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            InfoRow(tr('Sender'), p.merchantName),
            if (p.description.isNotEmpty) InfoRow(tr('Contents'), p.description),
            InfoRow(tr('Weight'), '${p.weightKg} kg'),
            if (p.attempts > 0) InfoRow(tr('Earlier attempts'), '${p.attempts}'),
          ]),
        ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: pickup
              ? FilledButton.icon(onPressed: () => _pickup(context, ref), icon: const Icon(Icons.qr_code_scanner_rounded), label: Text(tr('Scan to confirm pickup')))
              : p.status == 'out_for_delivery'
                  ? Row(children: [
                      Expanded(
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(foregroundColor: MasarColors.danger, minimumSize: const Size.fromHeight(52)),
                          onPressed: () => _fail(context, ref),
                          child: Text(tr('Failed')),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(flex: 2, child: FilledButton(onPressed: () => _deliver(context, ref), child: Text(tr('Deliver')))),
                    ])
                  : const SizedBox.shrink(),
        ),
      ),
    );
  }
}

class _Fail {
  const _Fail(this.reason, this.note, this.day);
  final String reason;
  final String? note;
  final String? day;
}

class _FailSheet extends StatefulWidget {
  const _FailSheet();

  @override
  State<_FailSheet> createState() => _FailSheetState();
}

class _FailSheetState extends State<_FailSheet> {
  String _reason = 'no_answer';
  DateTime? _day;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final days = List.generate(7, (i) => DateTime.now().add(Duration(days: i + 1)));
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('Why could it not be delivered?'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final e in failReasons.entries)
              ChoiceChip(
                label: Text(tr(e.value)),
                selected: _reason == e.key,
                labelStyle: TextStyle(color: _reason == e.key ? Colors.white : MasarColors.ink),
                onSelected: (_) => setState(() => _reason = e.key),
              ),
          ]),
          if (_reason == 'refused')
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(tr('A refused parcel goes back to the merchant straight away.'), style: const TextStyle(color: MasarColors.warn)),
            ),
          if (_reason == 'reschedule') ...[
            const SizedBox(height: 16),
            Text(tr('Which day?'), style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final d in days)
                ChoiceChip(
                  label: Text(dateOnly(d)),
                  selected: _day != null && isoDay(_day!) == isoDay(d),
                  labelStyle: TextStyle(color: _day != null && isoDay(_day!) == isoDay(d) ? Colors.white : MasarColors.ink),
                  onSelected: (_) => setState(() => _day = d),
                ),
            ]),
          ],
          const SizedBox(height: 16),
          TextField(controller: _note, maxLength: 200, decoration: InputDecoration(labelText: tr('Note for operations (optional)'))),
          const SizedBox(height: 8),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: MasarColors.danger),
            onPressed: () => Navigator.pop(context, _Fail(_reason, _note.text, _reason == 'reschedule' && _day != null ? isoDay(_day!) : null)),
            child: Text(tr('Record failed attempt')),
          ),
        ]),
      ),
    );
  }
}
