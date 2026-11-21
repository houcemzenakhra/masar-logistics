import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/i18n.dart';
import '../core/theme.dart';

/// Result of handling one scanned code in continuous mode: shown in the log under the camera.
class ScanResult {
  const ScanResult(this.code, this.message, {this.ok = true, this.lane});
  final String code;
  final String message;
  final bool ok;

  /// The hub's sorting lane for this parcel, shown large so it can be read at arm's length.
  final String? lane;
}

/// Camera barcode scanner, with a box to type the number when a label is damaged.
///
/// Single mode pops with the first code. Continuous mode (`onCode` given) keeps scanning and
/// lists the result of each code, so a hub team can scan a pile of parcels without tapping.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.title, this.onCode, this.hint});
  final String title;
  final String? hint;
  final Future<ScanResult> Function(String code)? onCode;

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _controller = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates, formats: const [BarcodeFormat.code128, BarcodeFormat.qrCode, BarcodeFormat.code39]);
  final _typed = TextEditingController();
  final _log = <ScanResult>[];
  final _recent = <String, DateTime>{};
  bool _busy = false;
  bool _done = false;
  bool _torch = false;

  @override
  void dispose() {
    _controller.dispose();
    _typed.dispose();
    super.dispose();
  }

  Future<void> _handle(String raw) async {
    final code = raw.trim().toUpperCase();
    if (code.isEmpty || _done) return;
    if (widget.onCode == null) {
      _done = true;
      Navigator.of(context).pop(code);
      return;
    }
    // The same label held in front of the camera is read many times a second.
    final seen = _recent[code];
    if (seen != null && DateTime.now().difference(seen) < const Duration(seconds: 4)) return;
    _recent[code] = DateTime.now();
    if (_busy) return;
    setState(() => _busy = true);
    final r = await widget.onCode!(code);
    HapticFeedback.mediumImpact();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _log.insert(0, r);
    });
  }

  @override
  Widget build(BuildContext context) {
    final continuous = widget.onCode != null;
    final ok = _log.where((r) => r.ok).length;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: tr('Torch'),
            icon: Icon(_torch ? Icons.flash_on_rounded : Icons.flash_off_rounded),
            onPressed: () {
              _controller.toggleTorch();
              setState(() => _torch = !_torch);
            },
          ),
        ],
      ),
      body: Column(children: [
        Expanded(
          flex: continuous ? 5 : 1,
          child: Stack(alignment: Alignment.center, children: [
            MobileScanner(controller: _controller, onDetect: (c) {
              for (final b in c.barcodes) {
                final v = b.rawValue;
                if (v != null && v.isNotEmpty) {
                  _handle(v);
                  break;
                }
              }
            }),
            Container(
              width: 280,
              height: 130,
              decoration: BoxDecoration(border: Border.all(color: _busy ? MasarColors.accent : Colors.white, width: 3), borderRadius: BorderRadius.circular(16)),
            ),
            Positioned(
              bottom: 20,
              left: 16,
              right: 16,
              child: Text(widget.hint ?? tr('Point the camera at the barcode'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15, shadows: [Shadow(blurRadius: 6)])),
            ),
          ]),
        ),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _typed,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(hintText: tr('Or type the number'), isDense: true),
                onSubmitted: (v) {
                  _typed.clear();
                  _handle(v);
                },
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: () {
                final v = _typed.text;
                _typed.clear();
                _handle(v);
              },
              icon: const Icon(Icons.check_rounded),
              tooltip: tr('Enter'),
            ),
          ]),
        ),
        if (continuous)
          Expanded(
            flex: 4,
            child: Container(
              color: MasarColors.paper,
              child: Column(children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Row(children: [
                    Expanded(child: Text(tr('{n} scanned, {ok} accepted', {'n': _log.length, 'ok': ok}), style: const TextStyle(fontWeight: FontWeight.w600))),
                    if (_busy) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  ]),
                ),
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    itemCount: _log.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final r = _log[i];
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(color: r.ok ? MasarColors.okSoft : MasarColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          Icon(r.ok ? Icons.check_circle_rounded : Icons.error_rounded, size: 18, color: r.ok ? MasarColors.ok : MasarColors.danger),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Directionality(textDirection: TextDirection.ltr, child: Text(r.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600))),
                              Text(r.message, style: const TextStyle(fontSize: 13)),
                            ]),
                          ),
                          if (r.lane != null)
                            Container(
                              margin: const EdgeInsetsDirectional.only(start: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(color: MasarColors.navy, borderRadius: BorderRadius.circular(10)),
                              child: Text(r.lane!, style: const TextStyle(color: Colors.white, fontFamily: 'monospace', fontSize: 26, fontWeight: FontWeight.w800)),
                            ),
                        ]),
                      );
                    },
                  ),
                ),
              ]),
            ),
          ),
      ]),
    );
  }
}

/// Opens the scanner and returns one code, or null.
Future<String?> scanOnce(BuildContext context, {String? title}) =>
    Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => ScanScreen(title: title ?? tr('Scan label'))));
