import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/i18n.dart';
import '../../core/outbox.dart';
import '../../core/push.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';
import '../auth/auth_controller.dart';

const _roles = {'courier': 'Courier', 'hub': 'Hub team', 'admin': 'Operations', 'merchant': 'Merchant'};

/// Whether this merchant's new orders wait for the recipient's confirmation.
final _confirmOrdersProvider = FutureProvider.autoDispose<bool>((ref) async {
  final r = await ref.read(apiProvider).get('/merchant/settings');
  return r['confirmOrders'] == true;
});

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    final lang = ref.watch(localeProvider);
    final pending = ref.watch(outboxProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Settings'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        CardBox(
          child: Row(children: [
            CircleAvatar(backgroundColor: MasarColors.accentSoft, foregroundColor: MasarColors.accent, child: Text(user.name.isEmpty ? '?' : user.name[0].toUpperCase())),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                Text('${tr(_roles[user.role] ?? user.role)} · ${user.email}', style: const TextStyle(color: MasarColors.muted, fontSize: 13)),
              ]),
            ),
          ]),
        ),
        SectionTitle(tr('Language')),
        CardBox(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: RadioGroup<String>(
            groupValue: lang,
            onChanged: (v) {
              if (v == null) return;
              ref.read(localeProvider.notifier).set(v);
              // Notifications follow the app's language.
              registerForPush(ref.read(apiProvider), v);
            },
            child: Column(children: [for (final l in supportedLangs) RadioListTile<String>(value: l, title: Text(langNames[l]!))]),
          ),
        ),
        if (user.role == 'merchant') ...[
          SectionTitle(tr('Order confirmation')),
          CardBox(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: ref.watch(_confirmOrdersProvider).when(
                  loading: () => const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
                  error: (e, _) => ErrorRetry(error: e, onRetry: () => ref.invalidate(_confirmOrdersProvider)),
                  data: (on) => SwitchListTile(
                    value: on,
                    title: Text(tr('Ask recipients to confirm each new order')),
                    subtitle: Text(tr('They get a text message with a link to confirm or cancel. A cancelled order costs you nothing.')),
                    onChanged: (v) async {
                      final r = await runAction(context, () => ref.read(apiProvider).post('/merchant/settings', {'confirmOrders': v}));
                      if (r != null) ref.invalidate(_confirmOrdersProvider);
                    },
                  ),
                ),
          ),
        ],
        SectionTitle(tr('This phone')),
        CardBox(
          child: Column(children: [
            InfoRow(tr('Server'), ref.read(apiProvider).base.replaceFirst(RegExp(r'^https?://'), '')),
            InfoRow(tr('Push notifications'), pushReady ? tr('On') : tr('In-app inbox only')),
            InfoRow(tr('Waiting to be sent'), '${pending.length}'),
          ]),
        ),
        if (pending.isNotEmpty) ...[
          const SizedBox(height: 10),
          OutlinedButton.icon(
            icon: const Icon(Icons.sync_rounded),
            label: Text(tr('Send now')),
            onPressed: () async {
              final refused = await ref.read(outboxProvider.notifier).flush();
              if (!context.mounted) return;
              toast(context, refused.isEmpty ? tr('Sent.') : refused.join('\n'), error: refused.isNotEmpty);
            },
          ),
        ],
        const SizedBox(height: 28),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: MasarColors.danger),
          icon: const Icon(Icons.logout_rounded),
          label: Text(tr('Sign out')),
          onPressed: () async {
            if (pending.isNotEmpty) {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: Text(tr('Sign out?')),
                  content: Text(tr('{n} actions are still waiting for signal on this phone. If you sign out they are lost.', {'n': pending.length})),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('Cancel'))),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('Sign out'))),
                  ],
                ),
              );
              if (ok != true) return;
              await ref.read(outboxProvider.notifier).clear();
            }
            await ref.read(authProvider.notifier).signOut();
          },
        ),
      ]),
    );
  }
}
