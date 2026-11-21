import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/duty.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/outbox.dart';

class CourierTasks {
  const CourierTasks({required this.cash, required this.proofRequired, required this.pickups, required this.deliveries});
  final int cash;
  final bool proofRequired;
  final List<Parcel> pickups;
  final List<Parcel> deliveries;

  int get codToCollect => deliveries.fold(0, (a, p) => a + p.codAmount);
}

final courierTasksProvider = FutureProvider<CourierTasks>((ref) async {
  final res = await ref.read(apiProvider).get('/courier/tasks');
  List<Parcel> list(String k) => (res[k] as List).map((e) => Parcel.fromJson(e as Map<String, dynamic>)).toList();
  return CourierTasks(
    cash: (res['cashToHandOver'] as num).toInt(),
    proofRequired: res['proofRequired'] == true,
    pickups: list('pickups'),
    deliveries: list('deliveries'),
  );
});

/// Parcels the courier has acted on that are still waiting for signal: hidden from the run list.
final doneLocallyProvider = Provider<Set<String>>((ref) {
  final queued = ref.watch(outboxProvider);
  return queued.map((c) => c.path.split('/').length > 2 ? c.path.split('/')[2] : '').toSet();
});

/// What the courier recorded at the door.
class DeliveryProof {
  DeliveryProof({this.code = '', this.photo, this.signature, this.receivedBy = ''});
  String code;
  String? photo;
  String? signature;
  String receivedBy;

  bool get any => code.length == 4 || photo != null || signature != null;
}

class CourierActions {
  CourierActions(this.ref);
  final Ref ref;

  Outbox get _outbox => ref.read(outboxProvider.notifier);

  /// Each returns true when sent, false when saved for later; throws when refused.
  Future<bool> pickedUp(Parcel p) =>
      _outbox.submit(QueuedCall(path: '/parcels/${p.id}/transition', body: {'to': 'picked_up'}, label: '${p.tracking} · ${tr('Picked up')}'));

  Future<bool> deliver(Parcel p, DeliveryProof proof) {
    final pos = ref.read(dutyProvider).last;
    return _outbox.submit(QueuedCall(
      path: '/parcels/${p.id}/deliver',
      body: {
        if (proof.code.length == 4) 'code': proof.code,
        if (proof.photo != null) 'photo': proof.photo,
        if (proof.signature != null) 'signature': proof.signature,
        if (proof.receivedBy.trim().isNotEmpty) 'receivedBy': proof.receivedBy.trim(),
        if (pos != null) 'lat': pos.latitude,
        if (pos != null) 'lng': pos.longitude,
      },
      label: '${p.tracking} · ${tr('Delivered')}',
    ));
  }

  Future<bool> fail(Parcel p, String reason, {String? note, String? day}) => _outbox.submit(QueuedCall(
        path: '/parcels/${p.id}/fail',
        body: {'reason': reason, if (note != null && note.trim().isNotEmpty) 'note': note.trim(), if (day != null) 'preferredDate': day},
        label: '${p.tracking} · ${tr(failReasons[reason] ?? reason)}',
      ));

  Future<Map<String, dynamic>> planRoute() => ref.read(apiProvider).post('/courier/route', const {});
}

final courierActionsProvider = Provider<CourierActions>(CourierActions.new);

class Receipt {
  const Receipt(this.code, this.at, this.expected, this.counted, this.difference);
  final String code;
  final DateTime at;
  final int expected;
  final int counted;
  final int difference;
}

final receiptsProvider = FutureProvider.autoDispose<List<Receipt>>((ref) async {
  final r = await ref.read(apiProvider).get('/courier/handovers');
  return (r['handovers'] as List).map((e) {
    final h = e as Map<String, dynamic>;
    return Receipt(h['code'] as String, DateTime.parse(h['createdAt'] as String).toLocal(), (h['expected'] as num).toInt(), (h['counted'] as num).toInt(), (h['difference'] as num).toInt());
  }).toList();
});
