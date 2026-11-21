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
import '../parcel/parcel_providers.dart';
import 'merchant_providers.dart';

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
  final _cod = TextEditingController();
  final _weight = TextEditingController(text: '1');
  final _contents = TextEditingController();
  int? _wilaya;
  Commune? _commune;
  String _lang = 'fr';
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _address, _cod, _weight, _contents]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final r = await ref.read(apiProvider).post('/parcels', {
        'recipientName': _name.text.trim(),
        'recipientPhone': _phone.text.trim(),
        'recipientLang': _lang,
        'destWilayaId': _wilaya,
        'communeId': _commune!.id,
        'address': _address.text.trim(),
        if (_contents.text.trim().isNotEmpty) 'description': _contents.text.trim(),
        'weightKg': double.tryParse(_weight.text.replaceAll(',', '.')) ?? 1,
        'codAmount': int.tryParse(_cod.text.replaceAll(RegExp(r'\D'), '')) ?? 0,
      });
      final p = Parcel.fromJson(r['parcel'] as Map<String, dynamic>);
      ref.invalidate(parcelsProvider);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.check_circle_rounded, color: MasarColors.ok, size: 40),
          title: Text(tr('Order created')),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Ltr(p.tracking, style: const TextStyle(fontFamily: 'monospace', fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(tr('Delivery fee: {x}. Write the tracking number on the parcel or print the label from the website.', {'x': dzd(p.deliveryFee)}), textAlign: TextAlign.center),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Done')))],
        ),
      );
      if (mounted) context.pushReplacement('/parcel/${p.id}');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? tr('Required') : null;

  @override
  Widget build(BuildContext context) {
    final wilayas = ref.watch(wilayasProvider);
    final communes = _wilaya == null ? null : ref.watch(communesProvider(_wilaya!));
    return Scaffold(
      appBar: AppBar(title: Text(tr('New order'))),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          SectionTitle(tr('Recipient')),
          TextFormField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: tr('Full name')), validator: _required),
          const SizedBox(height: 10),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: tr('Mobile number'), hintText: '0550 12 34 56'),
            validator: (v) {
              final d = (v ?? '').replaceAll(RegExp(r'\D'), '');
              final ok = RegExp(r'^(?:213|0)?[567]\d{8}$').hasMatch(d);
              return ok ? null : tr('Enter an Algerian mobile number, e.g. 0550 12 34 56');
            },
          ),
          const SizedBox(height: 10),
          wilayas.when(
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => ErrorRetry(error: e, onRetry: () => ref.invalidate(wilayasProvider)),
            data: (list) => DropdownButtonFormField<int>(
              initialValue: _wilaya,
              isExpanded: true,
              decoration: InputDecoration(labelText: tr('Wilaya')),
              items: [for (final w in list) DropdownMenuItem(value: w.id, child: Text(w.label))],
              onChanged: (v) => setState(() {
                _wilaya = v;
                _commune = null;
              }),
              validator: (v) => v == null ? tr('Choose the wilaya') : null,
            ),
          ),
          const SizedBox(height: 10),
          if (communes != null)
            communes.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => ErrorRetry(error: e, onRetry: () => ref.invalidate(communesProvider(_wilaya!))),
              data: (list) => DropdownButtonFormField<int>(
                key: ValueKey(_wilaya),
                initialValue: _commune?.id,
                isExpanded: true,
                decoration: InputDecoration(labelText: tr('Commune')),
                items: [for (final c in list) DropdownMenuItem(value: c.id, child: Text(c.label))],
                onChanged: (v) => setState(() => _commune = list.firstWhere((c) => c.id == v)),
                validator: (v) => v == null ? tr('Choose the commune') : null,
              ),
            ),
          const SizedBox(height: 10),
          TextFormField(controller: _address, maxLines: 2, decoration: InputDecoration(labelText: tr('Address')), validator: (v) => (v ?? '').trim().length < 4 ? tr('Write the street and building') : null),
          const SizedBox(height: 14),
          Text(tr('Text messages to the recipient in'), style: const TextStyle(color: MasarColors.ink2)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'fr', label: Text('Français')), ButtonSegment(value: 'ar', label: Text('العربية'))],
            selected: {_lang},
            onSelectionChanged: (s) => setState(() => _lang = s.first),
          ),
          SectionTitle(tr('Parcel')),
          TextFormField(
            controller: _cod,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: tr('Cash to collect (DZD)'), helperText: tr('0 if the order is already paid')),
            validator: _required,
          ),
          const SizedBox(height: 10),
          TextFormField(controller: _weight, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: tr('Weight (kg)'))),
          const SizedBox(height: 10),
          TextFormField(controller: _contents, maxLength: 120, decoration: InputDecoration(labelText: tr('Contents (optional)'))),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : Text(tr('Create order')),
          ),
        ]),
      ),
    );
  }
}
