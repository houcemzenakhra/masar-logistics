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
