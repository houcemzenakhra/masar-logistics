import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/models.dart';

class Wallet {
  const Wallet(this.balance, this.entries);
  final int balance;
  final List<WalletEntry> entries;
}

final walletProvider = FutureProvider.autoDispose<Wallet>((ref) async {
  final r = await ref.read(apiProvider).get('/merchant/wallet');
  return Wallet((r['balance'] as num).toInt(), (r['entries'] as List).map((e) => WalletEntry.fromJson(e as Map<String, dynamic>)).toList());
});

final claimsProvider = FutureProvider.autoDispose<List<Claim>>((ref) async {
  final r = await ref.read(apiProvider).get('/claims');
  return (r['claims'] as List).map((e) => Claim.fromJson(e as Map<String, dynamic>)).toList();
});

final claimProvider = FutureProvider.autoDispose.family<Claim, String>((ref, id) async {
  final r = await ref.read(apiProvider).get('/claims/$id');
  return Claim.fromJson(r['claim'] as Map<String, dynamic>);
});

final wilayasProvider = FutureProvider<List<Wilaya>>((ref) async {
  final r = await ref.read(apiProvider).get('/wilayas');
  return (r['wilayas'] as List).map((e) => Wilaya.fromJson(e as Map<String, dynamic>)).toList();
});

final communesProvider = FutureProvider.family<List<Commune>, int>((ref, wilayaId) async {
  final r = await ref.read(apiProvider).get('/wilayas/$wilayaId/communes');
  return (r['communes'] as List).map((e) => Commune.fromJson(e as Map<String, dynamic>)).toList();
});

class Payouts {
  const Payouts({required this.available, required this.pending, required this.minimum, this.account, this.requests = const []});
  final int available;
  final int pending;
  final int minimum;

  /// method, account and holder, or null when not set up yet.
  final Map<String, dynamic>? account;
  final List<Map<String, dynamic>> requests;
}

final payoutsProvider = FutureProvider.autoDispose<Payouts>((ref) async {
  final r = await ref.read(apiProvider).get('/merchant/payouts');
  return Payouts(
    available: (r['available'] as num).toInt(),
    pending: (r['pending'] as num).toInt(),
    minimum: (r['minimum'] as num).toInt(),
    account: r['account'] as Map<String, dynamic>?,
    requests: ((r['requests'] as List?) ?? const []).cast<Map<String, dynamic>>(),
  );
});

/// Open stop desks in a wilaya (empty when there is none).
final desksProvider = FutureProvider.family<List<Desk>, int>((ref, wilayaId) async {
  final r = await ref.read(apiProvider).get('/desks', query: {'wilaya': '$wilayaId'});
  return ((r['desks'] as List?) ?? const []).map((e) => Desk.fromJson(e as Map<String, dynamic>)).toList();
});
