import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'i18n.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.offline = false, this.status});
  final String message;

  /// True when the request never reached the server: worth queueing and retrying.
  final bool offline;
  final int? status;

  bool get unauthorized => status == 401;

  @override
  String toString() => message;
}

/// The Masar JSON API. One instance for the app; the token is set after sign-in.
class Api {
  Api(String base)
      : _dio = Dio(BaseOptions(
          connectTimeout: const Duration(seconds: 10),
          sendTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
          contentType: 'application/json',
        )) {
    this.base = base;
  }

  final Dio _dio;
  String? token;
  late String _base;

  String get base => _base;
  set base(String v) {
    _base = v.endsWith('/') ? v.substring(0, v.length - 1) : v;
    _dio.options.baseUrl = '$_base/api/v1';
  }

  /// Headers for pictures served by the API (proof photos, claim photos).
  Map<String, String> get imageHeaders => {if (token != null) 'Authorization': 'Bearer $token'};
  String url(String path) => '$_base/api/v1$path';

  Options get _opts => Options(headers: {
        if (token != null) 'Authorization': 'Bearer $token',
        'Accept-Language': I18n.lang,
      });

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) =>
      _run(() => _dio.get<Map<String, dynamic>>(path, queryParameters: query, options: _opts));

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) =>
      _run(() => _dio.post<Map<String, dynamic>>(path, data: body, options: _opts));

  Future<Map<String, dynamic>> delete(String path, Map<String, dynamic> body) =>
      _run(() => _dio.delete<Map<String, dynamic>>(path, data: body, options: _opts));

  Future<Map<String, dynamic>> _run(Future<Response<Map<String, dynamic>>> Function() call) async {
    try {
      return (await call()).data ?? const {};
    } on DioException catch (e) {
      final res = e.response;
      if (res != null) {
        final data = res.data;
        final msg = data is Map && data['error'] is String ? data['error'] as String : tr('The server could not do that (error {n}).', {'n': res.statusCode ?? 0});
        throw ApiException(msg, status: res.statusCode);
      }
      throw ApiException(tr('No connection to the server'), offline: true);
    }
  }
}

const _serverKey = 'masar_server';

/// The server can be changed from the sign-in screen, for testing against another copy.
Future<String> savedServer() async => (await SharedPreferences.getInstance()).getString(_serverKey) ?? Config.apiBase;
Future<void> saveServer(String v) async => (await SharedPreferences.getInstance()).setString(_serverKey, v.trim());

final apiProvider = Provider<Api>((_) => Api(Config.apiBase));
