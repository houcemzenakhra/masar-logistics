import 'package:flutter_test/flutter_test.dart';
import 'package:masar_mobile/core/format.dart';
import 'package:masar_mobile/core/i18n.dart';
import 'package:masar_mobile/core/models.dart';
import 'package:masar_mobile/core/outbox.dart';

void main() {
  test('money uses Western digits and commas', () {
    expect(money(4500), '4,500');
    expect(money(-1250000), '-1,250,000');
    expect(money(0), '0');
  });

  test('translations fall back to English and fill placeholders', () {
    I18n.use('en');
    expect(tr('{n} parcels', {'n': 3}), '3 parcels');
    I18n.use('fr');
    expect(tr('{n} parcels', {'n': 3}), '3 colis');
    expect(tr('A sentence nobody translated'), 'A sentence nobody translated');
    I18n.use('ar');
    expect(tr('Deliver'), 'تسليم');
    I18n.use('en');
  });

  test('every French text has an Arabic one', () {
    I18n.use('fr');
    final frKeys = <String>{};
    for (final k in const ['Deliver', 'Scan in', 'Cash you hold', 'Report a problem']) {
      expect(tr(k), isNot(k), reason: k);
      frKeys.add(k);
    }
    I18n.use('ar');
    for (final k in frKeys) {
      expect(tr(k), isNot(k), reason: k);
    }
    I18n.use('en');
  });

  test('a parcel reads from the API', () {
    final p = Parcel.fromJson({
      'id': 'p1',
      'tracking': 'MSR004512907',
      'status': 'out_for_delivery',
      'recipientName': 'Amina',
      'recipientPhone': '0550 12 34 56',
      'destWilaya': 'Alger',
      'destWilayaAr': 'الجزائر',
      'commune': 'Bab Ezzouar',
      'communeAr': 'باب الزوار',
      'address': 'Rue 1',
      'codAmount': 4500,
      'deliveryFee': 400,
      'returnFee': 200,
      'merchantName': 'Dar El Moda',
      'updatedAt': '2026-11-20T10:00:00.000Z',
      'createdAt': '2026-11-19T10:00:00.000Z',
      'lat': 36.72,
      'lng': 3.18,
      'routeSeq': 2,
      'instructions': 'Call when outside',
    });
    expect(p.merchantNet, 4100);
    expect(p.hasMapPoint, isTrue);
    I18n.use('ar');
    expect(p.place, 'باب الزوار، الجزائر');
    I18n.use('en');
    expect(p.place, 'Bab Ezzouar, Alger');
  });

  test('queued calls carry an idempotency key and the real time', () {
    final at = DateTime.utc(2026, 11, 20, 9, 30);
    final c = QueuedCall(path: '/parcels/p1/deliver', body: {'code': '1234'}, label: 'x', at: at);
    final again = QueuedCall.fromJson(c.toJson());
    expect(again.key, c.key);
    expect(again.payload['idempotencyKey'], c.key);
    expect(again.payload['at'], '2026-11-20T09:30:00.000Z');
    expect(again.payload['code'], '1234');
  });
}
