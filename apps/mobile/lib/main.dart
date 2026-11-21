import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/i18n.dart';
import 'core/inbox.dart';
import 'core/models.dart';
import 'core/push.dart';
import 'core/theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/courier/courier_home.dart';
import 'features/courier/courier_providers.dart';
import 'features/courier/stop_screen.dart';
import 'features/hub/hub_home.dart';
import 'features/hub/linehaul_screens.dart';
import 'features/inbox/inbox_screen.dart';
import 'features/merchant/claim_screens.dart';
import 'features/merchant/merchant_shell.dart';
import 'features/merchant/new_order_screen.dart';
import 'features/parcel/parcel_providers.dart';
import 'features/parcel/parcel_screen.dart';
import 'features/settings/settings_screen.dart';
import 'shared/widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initPush();
  runApp(const ProviderScope(child: MasarApp()));
}

final _messenger = GlobalKey<ScaffoldMessengerState>();

/// One app, three kinds of people. Who signs in decides the home screen.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ValueNotifier<AsyncValue<User?>>(const AsyncLoading());
  ref.listen(authProvider, (_, next) => auth.value = next, fireImmediately: true);
  ref.onDispose(auth.dispose);

  return GoRouter(
    refreshListenable: auth,
    initialLocation: '/',
    redirect: (context, state) {
      final a = ref.read(authProvider);
      final here = state.matchedLocation;
      if (a.isLoading && !a.hasValue) return here == '/splash' ? null : '/splash';
      if (a.hasError && !a.hasValue) return here == '/login' ? null : '/login';
      final signedIn = a.valueOrNull != null;
      if (!signedIn) return here == '/login' ? null : '/login';
      if (here == '/login' || here == '/splash') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _Splash()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/', builder: (_, __) => const _Home()),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/inbox', builder: (_, __) => const InboxScreen()),
      GoRoute(
        path: '/parcel/:id',
        builder: (_, s) {
          final id = s.pathParameters['id']!;
          final extra = s.extra;
          return _ParcelRoute(id: id, known: extra is Parcel ? extra : null);
        },
      ),
      GoRoute(path: '/orders/new', builder: (_, __) => const NewOrderScreen()),
      GoRoute(path: '/claims/new', builder: (_, s) => NewClaimScreen(tracking: s.uri.queryParameters['tracking'])),
      GoRoute(path: '/claims/:id', builder: (_, s) => ClaimScreen(id: s.pathParameters['id']!)),
      GoRoute(path: '/hub/bags', builder: (_, __) => const BagsScreen()),
      GoRoute(path: '/hub/bags/:id', builder: (_, s) => BagScreen(id: s.pathParameters['id']!)),
      GoRoute(path: '/hub/manifests', builder: (_, __) => const ManifestsScreen()),
      GoRoute(path: '/hub/manifests/:id', builder: (_, s) => ManifestScreen(id: s.pathParameters['id']!)),
    ],
  );
});

class MasarApp extends ConsumerStatefulWidget {
  const MasarApp({super.key});

  @override
  ConsumerState<MasarApp> createState() => _MasarAppState();
}

class _MasarAppState extends ConsumerState<MasarApp> {
  final _subs = <StreamSubscription<Object?>>[];

  @override
  void initState() {
    super.initState();
    // A tapped notification opens what it is about.
    _subs.add(pushTaps.stream.listen((data) {
      final route = notificationRoute(data);
      if (route != null && ref.read(authProvider).valueOrNull != null) ref.read(routerProvider).push(route);
    }));
    // While the app is open, show the message and refresh what it concerns.
    _subs.add(pushForeground.stream.listen((m) {
      ref.read(inboxProvider.notifier).refresh();
      if (m.data['kind'] == 'jobs' || m.data['kind'] == 'recipient') ref.invalidate(courierTasksProvider);
      final n = m.notification;
      if (n != null) {
        _messenger.currentState?.showSnackBar(SnackBar(
          content: Text('${n.title ?? ''}\n${n.body ?? ''}'.trim()),
          backgroundColor: MasarColors.navy,
          action: notificationRoute(m.data) == null ? null : SnackBarAction(label: tr('Open'), onPressed: () => ref.read(routerProvider).push(notificationRoute(m.data)!)),
        ));
      }
    }));
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'Masar',
      debugShowCheckedModeBanner: false,
      theme: masarTheme(),
      scaffoldMessengerKey: _messenger,
      routerConfig: ref.watch(routerProvider),
      locale: localeOf(lang),
      supportedLocales: [for (final l in supportedLangs) Locale(l)],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      // Rebuild every screen when the language changes, so all text is translated at once.
      builder: (context, child) => KeyedSubtree(key: ValueKey(lang), child: child ?? const SizedBox.shrink()),
    );
  }
}

class _Home extends ConsumerWidget {
  const _Home();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    // Start polling the inbox once someone is signed in.
    ref.watch(inboxProvider);
    switch (user?.role) {
      case 'courier':
        return const CourierHome();
      case 'merchant':
        return const MerchantShell();
      case 'hub':
      case 'admin':
        return const HubHome();
      default:
        return const _Splash();
    }
  }
}

/// Couriers open a stop with its actions; everyone else sees the full parcel page.
class _ParcelRoute extends ConsumerWidget {
  const _ParcelRoute({required this.id, this.known});
  final String id;
  final Parcel? known;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    if (user.role != 'courier') return ParcelScreen(id: id);
    if (known != null) return StopScreen(parcel: known!);
    final d = ref.watch(parcelDetailProvider(id));
    return d.when(
      data: (x) => StopScreen(parcel: x.parcel),
      error: (e, _) => Scaffold(appBar: AppBar(), body: ErrorRetry(error: e, onRetry: () => ref.invalidate(parcelDetailProvider(id)))),
      loading: () => Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator())),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(backgroundColor: MasarColors.navy, body: Center(child: MasarLogo(light: true, size: 40)));
}
