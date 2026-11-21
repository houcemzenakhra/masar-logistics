import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _show = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = tr('Enter your email and password.'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).signIn(_email.text, _password.text, askCode: _askCode);
    } on ApiException catch (e) {
      setState(() => _error = e.status == 401 && !e.message.contains('code') ? tr('Wrong email or password') : tr(e.message));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _askCode() {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Enter your code')),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('Open your authenticator app and enter the 6-digit code for this account.')),
          const SizedBox(height: 12),
          TextField(
            controller: c,
            autofocus: true,
            maxLength: 12,
            textAlign: TextAlign.center,
            autofillHints: const [AutofillHints.oneTimeCode],
            style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.w700),
            decoration: InputDecoration(counterText: '', helperText: tr('Lost your phone? Enter one of your recovery codes instead.'), helperMaxLines: 2),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: Text(tr('Sign in'))),
        ],
      ),
    );
  }

  Future<void> _server() async {
    final api = ref.read(apiProvider);
    final c = TextEditingController(text: api.base);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('Server')),
        content: TextField(controller: c, keyboardType: TextInputType.url, decoration: const InputDecoration(hintText: 'https://…')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, c.text), child: Text(tr('Save'))),
        ],
      ),
    );
    if (v == null || v.trim().isEmpty) return;
    api.base = v.trim();
    await saveServer(v);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(localeProvider);
    return Scaffold(
      backgroundColor: MasarColors.navy,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
          children: [
            Row(children: [
              const MasarLogo(light: true),
              const Spacer(),
              for (final l in supportedLangs)
                Padding(
                  padding: const EdgeInsetsDirectional.only(start: 4),
                  child: ChoiceChip(
                    label: Text(l == 'ar' ? 'ع' : l.toUpperCase()),
                    selected: l == lang,
                    showCheckmark: false,
                    labelStyle: TextStyle(color: l == lang ? Colors.white : Colors.white70),
                    backgroundColor: Colors.transparent,
                    selectedColor: Colors.white24,
                    side: const BorderSide(color: Colors.white24),
                    onSelected: (_) => ref.read(localeProvider.notifier).set(l),
                  ),
                ),
            ]),
            const SizedBox(height: 56),
            Text(tr('Sign in'), style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -0.5)),
            const SizedBox(height: 8),
            Text(tr('Couriers, hub teams and merchants use the same app. Your account decides what you see.'), style: const TextStyle(color: Colors.white70, height: 1.4)),
            const SizedBox(height: 32),
            AutofillGroup(
              child: Column(children: [
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: tr('Email')),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: !_show,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: tr('Password'),
                    suffixIcon: IconButton(
                      tooltip: _show ? tr('Hide password') : tr('Show password'),
                      icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                      onPressed: () => setState(() => _show = !_show),
                    ),
                  ),
                ),
              ]),
            ),
            if (_error != null)
              Container(
                margin: const EdgeInsets.only(top: 14),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: MasarColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(_error!, style: const TextStyle(color: MasarColors.danger)),
              ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : Text(tr('Sign in')),
            ),
            const SizedBox(height: 28),
            Center(
              child: TextButton.icon(
                onPressed: _server,
                icon: const Icon(Icons.dns_outlined, size: 16, color: Colors.white54),
                label: Text(ref.read(apiProvider).base.replaceFirst(RegExp(r'^https?://'), ''), style: const TextStyle(color: Colors.white54, fontSize: 13)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
