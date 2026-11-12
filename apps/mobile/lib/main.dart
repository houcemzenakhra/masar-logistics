import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/courier/courier_screen.dart';
import 'features/hub/hub_screen.dart';
import 'features/merchant/merchant_screens.dart';
import 'features/shared/widgets.dart';

void main() => runApp(const ProviderScope(child: MasarApp()));

/// One app, three roles. The home screen depends on who signed in.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ValueNotifier<AsyncValue<dynamic>>(const AsyncLoading());
  ref.listen(authProvider, (_, next) => auth.value = next, fireImmediately: true);
  ref.onDispose(auth.dispose);

  return GoRouter(
    refreshListenable: auth,
    initialLocation: '/',
    redirect: (context, state) {
      final a = ref.read(authProvider);
      if (a.isLoading) return state.matchedLocation == '/splash' ? null : '/splash';
      final signedIn = a.valueOrNull != null;
      if (!signedIn) return state.matchedLocation == '/login' ? null : '/login';
      if (state.matchedLocation == '/login' || state.matchedLocation == '/splash') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _Splash()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/', builder: (_, __) => const _Home()),
    ],
  );
});

class MasarApp extends ConsumerWidget {
  const MasarApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Masar',
      debugShowCheckedModeBanner: false,
      theme: masarTheme(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}

class _Home extends ConsumerWidget {
  const _Home();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    switch (user?.role) {
      case 'courier':
        return const CourierScreen();
      case 'merchant':
        return const MerchantShell();
      case 'hub':
      case 'admin':
        return const HubScreen();
      default:
        return const _Splash();
    }
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: MasarColors.navy,
      body: Center(child: MasarLogo(light: true)),
    );
  }
}
