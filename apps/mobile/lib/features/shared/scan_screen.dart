import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Full-screen barcode scanner. Pops with the first code it reads.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, this.title = 'Scan label'});
  final String title;

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            onDetect: (capture) {
              if (_done) return;
              final code = capture.barcodes.isEmpty ? null : capture.barcodes.first.rawValue;
              if (code == null || code.isEmpty) return;
              _done = true;
              Navigator.of(context).pop(code.trim().toUpperCase());
            },
          ),
          Container(
            width: 280,
            height: 130,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 3),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          const Positioned(
            bottom: 48,
            child: Text('Point the camera at the barcode', style: TextStyle(color: Colors.white, fontSize: 16)),
          ),
        ],
      ),
    );
  }
}
