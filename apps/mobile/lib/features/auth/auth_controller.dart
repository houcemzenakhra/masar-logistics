import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api.dart';
import '../../core/i18n.dart';
import '../../core/models.dart';
import '../../core/push.dart';

const _storage = FlutterSecureStorage();
const _tokenKey = 'masar_token';

/// The signed-in person, or null. The session is restored from secure storage on start;
/// without signal the last account stays signed in so a courier can keep working offline.
class AuthController extends AsyncNotifier<User?> {
  @override
  Future<User?> build() async {
    final api = ref.read(apiProvider);
    api.base = await savedServer();
    final token = await _storage.read(key: _tokenKey);
    if (token == null) return null;
    api.token = token;
    try {
      final res = await api.get('/me');
      final user = User.fromJson(res['user'] as Map<String, dynamic>);
      await _storage.write(key: '${_tokenKey}_user', value: _encode(user));
      return user;
    } on ApiException catch (e) {
      if (e.offline) {
        final cached = await _storage.read(key: '${_tokenKey}_user');
        if (cached != null) return _decode(cached);
        rethrow;
      }
      // Token expired, or the password was changed: sign in again.
      api.token = null;
      await _storage.delete(key: _tokenKey);
      return null;
    }
  }

  Future<void> signIn(String email, String password) async {
    final api = ref.read(apiProvider);
    final res = await api.post('/auth/login', {'email': email.trim(), 'password': password});
    final user = User.fromJson(res['user'] as Map<String, dynamic>);
    api.token = res['token'] as String;
    await _storage.write(key: _tokenKey, value: api.token);
    await _storage.write(key: '${_tokenKey}_user', value: _encode(user));
    state = AsyncData(user);
    // Notifications in the app's language, on this phone.
    registerForPush(api, I18n.lang);
  }

  Future<void> signOut() async {
    final api = ref.read(apiProvider);
    await unregisterPush(api);
    api.token = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: '${_tokenKey}_user');
    state = const AsyncData(null);
  }

  static String _encode(User u) => [u.id, u.name, u.email, u.role, u.hubId ?? '', u.merchantId ?? '', u.phone].join('\u0001');
  static User _decode(String s) {
    final p = s.split('\u0001');
    return User(id: p[0], name: p[1], email: p[2], role: p[3], hubId: p[4].isEmpty ? null : p[4], merchantId: p[5].isEmpty ? null : p[5], phone: p.length > 6 ? p[6] : '');
  }
}

final authProvider = AsyncNotifierProvider<AuthController, User?>(AuthController.new);

/// The signed-in user. Only use below the router's sign-in check.
final userProvider = Provider<User>((ref) => ref.watch(authProvider).valueOrNull!);
