import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api.dart';
import '../../core/models.dart';

const _storage = FlutterSecureStorage();
const _tokenKey = 'masar_token';

/// Holds the signed-in user, or null. Restores the session from secure storage on start.
class AuthController extends AsyncNotifier<User?> {
  @override
  Future<User?> build() async {
    final api = ref.read(apiProvider);
    final token = await _storage.read(key: _tokenKey);
    if (token == null) return null;
    api.token = token;
    try {
      final res = await api.get('/me');
      return User.fromJson(res['user'] as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.offline) rethrow;
      // Token expired or revoked.
      api.token = null;
      await _storage.delete(key: _tokenKey);
      return null;
    }
  }

  Future<void> signIn(String email, String password) async {
    final api = ref.read(apiProvider);
    final res = await api.post('/auth/login', {'email': email.trim(), 'password': password});
    api.token = res['token'] as String;
    await _storage.write(key: _tokenKey, value: api.token);
    state = AsyncData(User.fromJson(res['user'] as Map<String, dynamic>));
  }

  Future<void> signOut() async {
    ref.read(apiProvider).token = null;
    await _storage.delete(key: _tokenKey);
    state = const AsyncData(null);
  }
}

final authProvider = AsyncNotifierProvider<AuthController, User?>(AuthController.new);
