import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../auth/auth_controller.dart';

final hubsProvider = FutureProvider<List<Hub>>((ref) async {
  final r = await ref.read(apiProvider).get('/hubs');
  return (r['hubs'] as List).map((e) => Hub.fromJson(e as Map<String, dynamic>)).toList();
});

/// The hub this screen works for: the person's hub, or the one operations picked.
final chosenHubProvider = StateProvider<String?>((ref) => null);
final currentHubIdProvider = Provider<String?>((ref) => ref.watch(userProvider).hubId ?? ref.watch(chosenHubProvider));

class HubSummary {
  const HubSummary(this.raw);
  final Map<String, dynamic> raw;
  int n(String k) => (raw[k] as num?)?.toInt() ?? 0;
  String get name => ((raw['hub'] as Map?)?['name'] as String?) ?? '';
  List<Map<String, dynamic>> get incoming => ((raw['incoming'] as List?) ?? const []).cast<Map<String, dynamic>>();
}

final hubSummaryProvider = FutureProvider<HubSummary>((ref) async {
  final hubId = ref.watch(currentHubIdProvider);
  final r = await ref.read(apiProvider).get('/hub/summary', query: {if (hubId != null) 'hubId': hubId});
  return HubSummary(r);
});

final bagsProvider = FutureProvider<List<Bag>>((ref) async {
  final r = await ref.read(apiProvider).get('/bags');
  return (r['bags'] as List).map((e) => Bag.fromJson(e as Map<String, dynamic>)).toList();
});

final bagProvider = FutureProvider.family<(Bag, List<Parcel>), String>((ref, id) async {
  final r = await ref.read(apiProvider).get('/bags/$id');
  return (Bag.fromJson(r['bag'] as Map<String, dynamic>), (r['parcels'] as List).map((e) => Parcel.fromJson(e as Map<String, dynamic>)).toList());
});

final manifestsProvider = FutureProvider<List<Manifest>>((ref) async {
  final r = await ref.read(apiProvider).get('/manifests');
  return (r['manifests'] as List).map((e) => Manifest.fromJson(e as Map<String, dynamic>)).toList();
});

final manifestProvider = FutureProvider.family<(Manifest, List<Bag>), String>((ref, id) async {
  final r = await ref.read(apiProvider).get('/manifests/$id');
  return (Manifest.fromJson(r['manifest'] as Map<String, dynamic>), (r['bags'] as List).map((e) => Bag.fromJson(e as Map<String, dynamic>)).toList());
});
