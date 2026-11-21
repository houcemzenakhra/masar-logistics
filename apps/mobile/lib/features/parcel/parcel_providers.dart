import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';

class ParcelDetail {
  const ParcelDetail({required this.parcel, required this.proofs, required this.claims, this.history, this.returnLegs = const [], this.returnOf});
  final Parcel parcel;
  final List<Proof> proofs;
  final List<Claim> claims;

  /// How the recipient's past orders went (merchants and operations; null when off or none).
  final RecipientHistory? history;

  /// Return parcels made from this delivery, or the delivery this return comes from: (id, tracking).
  final List<(String, String)> returnLegs;
  final (String, String)? returnOf;
}

final parcelDetailProvider = FutureProvider.autoDispose.family<ParcelDetail, String>((ref, id) async {
  final r = await ref.read(apiProvider).get('/parcels/$id');
  return ParcelDetail(
    parcel: Parcel.fromJson(r['parcel'] as Map<String, dynamic>),
    proofs: ((r['proofs'] as List?) ?? const []).map((e) => Proof.fromJson(e as Map<String, dynamic>)).toList(),
    claims: ((r['claims'] as List?) ?? const []).map((e) => Claim.fromJson(e as Map<String, dynamic>)).toList(),
    history: RecipientHistory.fromJson(r['history']),
    returnLegs: ((r['returnLegs'] as List?) ?? const []).map((e) => e as Map<String, dynamic>).map((e) => (e['id'] as String, e['tracking'] as String)).toList(),
    returnOf: r['returnOf'] is Map ? ((r['returnOf'] as Map)['id'] as String, (r['returnOf'] as Map)['tracking'] as String) : null,
  );
});

/// Order list filters: status group and search text.
typedef ParcelQuery = ({String group, String q});

const statusGroups = <String, List<String>>{
  'all': [],
  'active': ['created', 'pickup_assigned', 'picked_up', 'at_origin_hub', 'in_transit', 'at_destination_hub', 'out_for_delivery', 'ready_for_pickup'],
  'problem': ['attempt_failed', 'return_initiated', 'lost'],
  'delivered': ['delivered'],
  'returned': ['returned', 'cancelled'],
};

final parcelsProvider = FutureProvider.autoDispose.family<List<Parcel>, ParcelQuery>((ref, f) async {
  final statuses = statusGroups[f.group] ?? const [];
  final r = await ref.read(apiProvider).get('/parcels', query: {
    if (statuses.isNotEmpty) 'status': statuses.join(','),
    if (f.q.trim().isNotEmpty) 'q': f.q.trim(),
  });
  return (r['parcels'] as List).map((e) => Parcel.fromJson(e as Map<String, dynamic>)).toList();
});
