import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../auth/auth_controller.dart';
import '../shared/scan_screen.dart';
import '../shared/widgets.dart';

class _ScanResult {
  const _ScanResult(this.tracking, this.message, this.ok);
  final String tracking;
  final String message;
  final bool ok;
}

/// Hub station: scan parcels in (from couriers, linehaul or returns) and out (to linehaul).
class HubScreen extends ConsumerStatefulWidget {
  const HubScreen({super.key});

  @override
  ConsumerState<HubScreen> createState() => _HubScreenState();
}

class _HubScreenState extends ConsumerState<HubScreen> {
  final _manual = TextEditingController();
  final _log = <_ScanResult>[];
  String _direction = 'in';
  bool _busy = false;

  @override
  void dispose() {
    _manual.dispose();
    super.dispose();
  }

  Future<void> _submit(String tracking) async {
    final code = tracking.trim().toUpperCase();
    if (code.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final res = await ref.read(apiProvider).post('/scan', {
        'tracking': code,
        'direction': _direction,
        'idempotencyKey': const Uuid().v4(),
      });
      // Scanning a bag in receives every parcel inside it; the server answers with the bag.
      final bag = res['bag'] as Map<String, dynamic>?;
      if (bag != null) {
        _log.insert(0, _ScanResult(code, 'Bag received · ${bag['parcels']} parcels', true));
      } else {
        final status = (res['parcel'] as Map<String, dynamic>)['status'] as String;
        _log.insert(0, _ScanResult(code, statusLabels[status] ?? status, true));
      }
      _manual.clear();
    } on ApiException catch (e) {
      _log.insert(0, _ScanResult(code, e.message, false));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _camera() async {
    final code = await Navigator.of(context)
        .push<String>(MaterialPageRoute(builder: (_) => ScanScreen(title: _direction == 'in' ? 'Scan in' : 'Scan out')));
    if (code != null) await _submit(code);
  }

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
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'in', label: Text('Scan in'), icon: Icon(Icons.south_west_rounded)),
              ButtonSegment(value: 'out', label: Text('Scan out'), icon: Icon(Icons.north_east_rounded)),
            ],
            selected: {_direction},
            onSelectionChanged: (s) => setState(() => _direction = s.first),
          ),
          const SizedBox(height: 8),
          Text(
            _direction == 'in'
                ? 'Arriving from a courier, from linehaul, or coming back as a return.'
                : 'Leaving on linehaul to its destination hub.',
            style: const TextStyle(color: MasarColors.muted),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : _camera,
            icon: const Icon(Icons.qr_code_scanner_rounded),
            label: const Text('Scan with camera'),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _manual,
                textCapitalization: TextCapitalization.characters,
                onSubmitted: _submit,
                decoration: const InputDecoration(hintText: 'Or type MSR… / BAG…'),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _busy ? null : () => _submit(_manual.text),
              icon: const Icon(Icons.arrow_forward_rounded),
              tooltip: 'Submit',
            ),
          ]),
          const SizedBox(height: 24),
          if (_log.isEmpty) const EmptyState('Scans from this session appear here.'),
          for (final r in _log)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  leading: Icon(
                    r.ok ? Icons.check_circle_rounded : Icons.error_rounded,
                    color: r.ok ? MasarColors.ok : MasarColors.danger,
                  ),
                  title: Text(r.tracking, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                  subtitle: Text(r.message),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
