import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/images.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/signature_pad.dart';
import '../../shared/widgets.dart';
import 'courier_providers.dart';

/// At the door: collect the cash and record a proof. Pops with true when sent, false when saved
/// for later. A wrong code keeps the screen open so the courier can ask again.
class DeliverScreen extends ConsumerStatefulWidget {
  const DeliverScreen({super.key, required this.parcel, required this.proofRequired});
  final Parcel parcel;
  final bool proofRequired;

  @override
  ConsumerState<DeliverScreen> createState() => _DeliverScreenState();
}

class _DeliverScreenState extends ConsumerState<DeliverScreen> {
  final _proof = DeliveryProof();
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _collected = TextEditingController();
  final _returned = TextEditingController();
  bool _partial = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _collected.dispose();
    _returned.dispose();
    super.dispose();
  }

  Future<void> _photo() async {
    final p = await pickPhoto();
    if (p != null) setState(() => _proof.photo = p);
  }

  Future<void> _sign() async {
    final s = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => SignatureScreen(name: widget.parcel.recipientName)));
    if (s != null) setState(() => _proof.signature = s);
  }

  Future<void> _submit() async {
    _proof
      ..code = _code.text.trim()
      ..receivedBy = _name.text;
    if (widget.proofRequired && !_proof.any) {
      setState(() => _error = tr('Record a proof first: the code, a photo or a signature.'));
      return;
    }
    if (_partial) {
      final amount = int.tryParse(_collected.text.trim());
      if (amount == null || amount < 0 || amount >= widget.parcel.codAmount) {
        setState(() => _error = tr('The amount collected must be less than the amount due, and not negative'));
        return;
      }
      if (_returned.text.trim().isEmpty) {
        setState(() => _error = tr('Say what the recipient did not keep'));
        return;
      }
      _proof
        ..collected = amount
        ..returnedItems = _returned.text;
    } else {
      _proof.collected = null;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await ref.read(courierActionsProvider).deliver(widget.parcel, _proof);
      if (mounted) Navigator.of(context).pop(sent);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.parcel;
    return Scaffold(
      appBar: AppBar(title: Text(tr('Deliver to {name}', {'name': p.recipientName}))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (p.codAmount > 0)
          CardBox(
            color: MasarColors.accentSoft,
            child: Row(children: [
              const Icon(Icons.payments_rounded, color: MasarColors.accent),
              const SizedBox(width: 12),
              Expanded(child: Text(tr('Collect'), style: const TextStyle(fontSize: 16))),
              Ltr(dzd(p.codAmount), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            ]),
          ),
        if (p.exchange)
          CardBox(
            color: MasarColors.infoSoft,
            child: Row(children: [
              const Icon(Icons.swap_horiz_rounded, color: MasarColors.info),
              const SizedBox(width: 12),
              Expanded(child: Text(tr('Exchange: take back {item}.', {'item': p.exchangeNote}), style: const TextStyle(fontWeight: FontWeight.w600))),
            ]),
          ),
        if (p.allowPartial && p.codAmount > 0) ...[
          const SizedBox(height: 10),
          CardBox(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _partial,
                onChanged: (v) => setState(() {
                  _partial = v;
                  _error = null;
                }),
                title: Text(tr('The recipient keeps only part of the order')),
                subtitle: Text(tr('Allowed by the merchant. The rest goes back with the return fee.')),
              ),
              if (_partial) ...[
                TextField(
                  controller: _collected,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(labelText: tr('Cash collected (DZD)')),
                ),
                const SizedBox(height: 10),
                TextField(controller: _returned, decoration: InputDecoration(labelText: tr('What comes back'))),
              ],
            ]),
          ),
        ],
        SectionTitle(widget.proofRequired ? tr('Proof of delivery (required)') : tr('Proof of delivery')),
        CardBox(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tr('Ask for the 4-digit code in their text message from Masar.'), style: const TextStyle(color: MasarColors.ink2)),
            const SizedBox(height: 10),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 4,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 28, letterSpacing: 14, fontWeight: FontWeight.w700),
              decoration: const InputDecoration(hintText: '• • • •', counterText: ''),
              onChanged: (_) => setState(() => _error = null),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: _ProofButton(icon: Icons.photo_camera_outlined, label: tr('Photo'), done: _proof.photo != null, onTap: _photo, onClear: () => setState(() => _proof.photo = null))),
          const SizedBox(width: 10),
          Expanded(child: _ProofButton(icon: Icons.draw_outlined, label: tr('Signature'), done: _proof.signature != null, onTap: _sign, onClear: () => setState(() => _proof.signature = null))),
        ]),
        if (_proof.photo != null) ...[
          const SizedBox(height: 10),
          ClipRRect(borderRadius: BorderRadius.circular(14), child: Image.memory(fromDataUrl(_proof.photo!), height: 160, fit: BoxFit.cover)),
        ],
        const SizedBox(height: 14),
        TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: tr('Received by (if not the recipient)'))),
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(top: 14),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: MasarColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
            child: Text(_error!, style: const TextStyle(color: MasarColors.danger)),
          ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                : Text(_partial
                    ? tr('Partial delivery')
                    : p.codAmount > 0
                        ? tr('Collected {x} · Delivered', {'x': dzd(p.codAmount)})
                        : tr('Delivered')),
          ),
        ),
      ),
    );
  }
}

class _ProofButton extends StatelessWidget {
  const _ProofButton({required this.icon, required this.label, required this.done, required this.onTap, required this.onClear});
  final IconData icon;
  final String label;
  final bool done;
  final VoidCallback onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: done ? MasarColors.okSoft : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: done ? MasarColors.ok : MasarColors.line)),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: done ? onClear : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(children: [
            Icon(done ? Icons.check_circle_rounded : icon, color: done ? MasarColors.ok : MasarColors.ink2),
            const SizedBox(height: 4),
            Text(done ? tr('{what} added · tap to remove', {'what': label}) : label, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: done ? MasarColors.ok : MasarColors.ink)),
          ]),
        ),
      ),
    );
  }
}
