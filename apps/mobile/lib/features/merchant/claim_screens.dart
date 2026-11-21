import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/images.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../shared/scan_screen.dart';
import '../../shared/widgets.dart';
import 'merchant_providers.dart';

class ClaimScreen extends ConsumerWidget {
  const ClaimScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ref.watch(claimProvider(id));
    return Scaffold(
      appBar: AppBar(title: c.valueOrNull == null ? Text(tr('Claim')) : Ltr(c.value!.code)),
      body: AsyncBody(
        value: c,
        onRetry: () => ref.invalidate(claimProvider(id)),
        data: (c) => ListView(padding: const EdgeInsets.all(16), children: [
          CardBox(
            child: Column(children: [
              Row(children: [
                Expanded(child: Text(tr(claimKinds[c.kind] ?? c.kind), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
                Pill(tr(claimStatus[c.status] ?? c.status), color: c.status == 'approved' ? MasarColors.ok : c.status == 'rejected' ? MasarColors.danger : MasarColors.warn),
              ]),
              const SizedBox(height: 6),
              InfoRow(tr('Parcel'), c.tracking),
              InfoRow(tr('Requested'), dzd(c.amountRequested)),
              if (c.amountApproved != null) InfoRow(tr('Paid into your wallet'), dzd(c.amountApproved!), valueStyle: const TextStyle(fontWeight: FontWeight.w700, color: MasarColors.ok)),
              InfoRow(tr('Filed'), dateTime(c.createdAt)),
            ]),
          ),
          const SizedBox(height: 12),
          CardBox(child: Text(c.description)),
          if (c.photoIds.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 130,
              child: ListView(scrollDirection: Axis.horizontal, children: [
                for (final pid in c.photoIds) Padding(padding: const EdgeInsetsDirectional.only(end: 10), child: ApiImage('/claims/${c.id}/photos/$pid', height: 130)),
              ]),
            ),
          ],
          if (c.decisionNote.isNotEmpty) ...[
            SectionTitle(tr('Note from Masar')),
            CardBox(child: Text(c.decisionNote)),
          ],
          if (c.status == 'open')
            Padding(padding: const EdgeInsets.only(top: 16), child: Text(tr('We answer every claim within two working days. You will get a notification.'), style: const TextStyle(color: MasarColors.muted))),
          const SizedBox(height: 12),
          TextButton(onPressed: () => context.push('/parcel/${c.parcelId}'), child: Text(tr('Open the parcel'))),
        ]),
      ),
    );
  }
}

class NewClaimScreen extends ConsumerStatefulWidget {
  const NewClaimScreen({super.key, this.tracking});
  final String? tracking;

  @override
  ConsumerState<NewClaimScreen> createState() => _NewClaimScreenState();
}

class _NewClaimScreenState extends ConsumerState<NewClaimScreen> {
  late final _tracking = TextEditingController(text: widget.tracking ?? '');
  final _desc = TextEditingController();
  final _amount = TextEditingController();
  final _photos = <String>[];
  String _kind = 'damaged';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _tracking.dispose();
    _desc.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _add(bool camera) async {
    if (camera) {
      final p = await pickPhoto();
      if (p != null) setState(() => _photos.add(p));
    } else {
      final list = await pickPhotos(max: 6 - _photos.length);
      setState(() => _photos.addAll(list));
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(apiProvider).post('/claims', {
        'tracking': _tracking.text.trim().toUpperCase(),
        'kind': _kind,
        'description': _desc.text.trim(),
        'amount': int.tryParse(_amount.text) ?? 0,
        'photos': _photos,
      });
      ref.invalidate(claimsProvider);
      if (!mounted) return;
      toast(context, tr('Claim sent. We will answer within two working days.'));
      context.pushReplacement('/claims/${(r['claim'] as Map)['id']}');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('Report a problem'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          controller: _tracking,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(
            labelText: tr('Tracking number'),
            suffixIcon: IconButton(
              tooltip: tr('Scan label'),
              icon: const Icon(Icons.qr_code_scanner_rounded),
              onPressed: () async {
                final c = await scanOnce(context);
                if (c != null) _tracking.text = c;
              },
            ),
          ),
        ),
        SectionTitle(tr('What happened?')),
        Wrap(spacing: 8, children: [
          for (final k in claimKinds.entries)
            ChoiceChip(
              label: Text(tr(k.value)),
              selected: _kind == k.key,
              showCheckmark: false,
              labelStyle: TextStyle(color: _kind == k.key ? Colors.white : MasarColors.ink),
              onSelected: (_) => setState(() => _kind = k.key),
            ),
        ]),
        const SizedBox(height: 14),
        TextField(controller: _desc, maxLines: 4, maxLength: 1000, decoration: InputDecoration(labelText: tr('Describe what happened'))),
        TextField(
          controller: _amount,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: tr('Amount you are claiming (DZD)'), helperText: tr('At most the cash on delivery of the parcel.')),
        ),
        SectionTitle(_kind == 'lost' ? tr('Photos (optional)') : tr('Photos of the parcel and the damage')),
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (var i = 0; i < _photos.length; i++)
            Stack(children: [
              ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(fromDataUrl(_photos[i]), width: 90, height: 90, fit: BoxFit.cover)),
              PositionedDirectional(
                top: 2,
                end: 2,
                child: InkWell(
                  onTap: () => setState(() => _photos.removeAt(i)),
                  child: const CircleAvatar(radius: 12, backgroundColor: Colors.black54, child: Icon(Icons.close, size: 14, color: Colors.white)),
                ),
              ),
            ]),
          if (_photos.length < 6) ...[
            _AddPhoto(icon: Icons.photo_camera_outlined, label: tr('Camera'), onTap: () => _add(true)),
            _AddPhoto(icon: Icons.photo_library_outlined, label: tr('Gallery'), onTap: () => _add(false)),
          ],
        ]),
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(top: 14),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: MasarColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
            child: Text(_error!, style: const TextStyle(color: MasarColors.danger)),
          ),
        const SizedBox(height: 18),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : Text(tr('Send claim')),
        ),
      ]),
    );
  }
}

class _AddPhoto extends StatelessWidget {
  const _AddPhoto({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: 90,
          height: 90,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: MasarColors.line, width: 1.5)),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(icon, color: MasarColors.muted), const SizedBox(height: 4), Text(label, style: const TextStyle(fontSize: 12, color: MasarColors.muted))]),
        ),
      );
}
