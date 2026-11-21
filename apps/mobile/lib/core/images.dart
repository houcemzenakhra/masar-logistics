import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:image_picker/image_picker.dart';

/// Takes or picks a photo, shrunk to about 1280 px so it uploads quickly on a weak signal.
/// Returns a data URL, or null when the person cancelled.
Future<String?> pickPhoto({bool camera = true}) async {
  final f = await ImagePicker().pickImage(source: camera ? ImageSource.camera : ImageSource.gallery, maxWidth: 1280, maxHeight: 1280, imageQuality: 70);
  if (f == null) return null;
  return toDataUrl(await f.readAsBytes());
}

Future<List<String>> pickPhotos({int max = 6}) async {
  final files = await ImagePicker().pickMultiImage(maxWidth: 1280, maxHeight: 1280, imageQuality: 70, limit: max);
  final out = <String>[];
  for (final f in files.take(max)) {
    out.add(toDataUrl(await f.readAsBytes()));
  }
  return out;
}

/// The server checks the real type from the bytes; the label here only has to be an image type.
String toDataUrl(Uint8List bytes) {
  final png = bytes.length > 4 && bytes[0] == 0x89 && bytes[1] == 0x50;
  return 'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}';
}

Uint8List fromDataUrl(String url) => base64Decode(url.substring(url.indexOf(',') + 1));

/// Draws signature strokes on white and returns them as a PNG data URL.
Future<String> signaturePng(List<List<ui.Offset>> strokes, ui.Size size) async {
  final rec = ui.PictureRecorder();
  final canvas = ui.Canvas(rec, ui.Offset.zero & size);
  canvas.drawRect(ui.Offset.zero & size, ui.Paint()..color = const ui.Color(0xFFFFFFFF));
  final pen = ui.Paint()
    ..color = const ui.Color(0xFF12161C)
    ..strokeWidth = 3
    ..strokeCap = ui.StrokeCap.round
    ..style = ui.PaintingStyle.stroke;
  for (final s in strokes) {
    if (s.length == 1) canvas.drawCircle(s.first, 1.5, pen..style = ui.PaintingStyle.fill);
    pen.style = ui.PaintingStyle.stroke;
    for (var i = 1; i < s.length; i++) {
      canvas.drawLine(s[i - 1], s[i], pen);
    }
  }
  final img = await rec.endRecording().toImage(size.width.round(), size.height.round());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return toDataUrl(data!.buffer.asUint8List());
}
