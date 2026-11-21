import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/images.dart';
import '../core/theme.dart';

/// Full-screen signature pad. Pops with a PNG data URL, or null.
class SignatureScreen extends StatefulWidget {
  const SignatureScreen({super.key, required this.name});
  final String name;

  @override
  State<SignatureScreen> createState() => _SignatureScreenState();
}

class _SignatureScreenState extends State<SignatureScreen> {
  final _strokes = <List<Offset>>[];
  Size _size = Size.zero;
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Signature')),
        actions: [
          TextButton(onPressed: _strokes.isEmpty ? null : () => setState(_strokes.clear), child: Text(tr('Clear'), style: const TextStyle(color: Colors.white))),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
          child: Text(tr('Ask {name} to sign in the box.', {'name': widget.name}), style: const TextStyle(color: MasarColors.ink2)),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: LayoutBuilder(builder: (context, c) {
              _size = Size(c.maxWidth, c.maxHeight);
              return Container(
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: MasarColors.line, width: 1.5)),
                child: GestureDetector(
                  onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
                  onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
                  child: CustomPaint(painter: _Ink(_strokes), size: Size.infinite),
                ),
              );
            }),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: FilledButton(
              onPressed: _strokes.isEmpty || _saving
                  ? null
                  : () async {
                      setState(() => _saving = true);
                      final png = await signaturePng(_strokes, _size);
                      if (context.mounted) Navigator.of(context).pop(png);
                    },
              child: Text(tr('Use this signature')),
            ),
          ),
        ),
      ]),
    );
  }
}

class _Ink extends CustomPainter {
  _Ink(this.strokes);
  final List<List<Offset>> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    final pen = Paint()
      ..color = MasarColors.ink
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final s in strokes) {
      for (var i = 1; i < s.length; i++) {
        canvas.drawLine(s[i - 1], s[i], pen);
      }
    }
  }

  @override
  bool shouldRepaint(_Ink old) => true;
}
