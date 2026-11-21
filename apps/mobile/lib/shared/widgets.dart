import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/theme.dart';

class MasarLogo extends StatelessWidget {
  const MasarLogo({super.key, this.light = false, this.size = 30});
  final bool light;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: MasarColors.accent, borderRadius: BorderRadius.circular(size * 0.3)),
          child: Icon(Icons.route_rounded, color: Colors.white, size: size * 0.62),
        ),
        SizedBox(width: size * 0.27),
        Text('masar', style: TextStyle(color: light ? Colors.white : MasarColors.ink, fontSize: size * 0.66, fontWeight: FontWeight.w600, letterSpacing: -0.4)),
      ],
    );
  }
}

Color statusColor(String status) {
  switch (status) {
    case 'delivered':
      return MasarColors.ok;
    case 'attempt_failed':
    case 'return_initiated':
      return MasarColors.warn;
    case 'lost':
      return MasarColors.danger;
    case 'at_origin_hub':
    case 'in_transit':
    case 'at_destination_hub':
      return MasarColors.progress;
    case 'pickup_assigned':
    case 'picked_up':
    case 'out_for_delivery':
    case 'ready_for_pickup':
      return MasarColors.info;
    default:
      return MasarColors.muted;
  }
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = MasarColors.muted});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) => Pill(tr(statusLabels[status] ?? status), color: statusColor(status));
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final offline = error is ApiException && (error as ApiException).offline;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(offline ? Icons.cloud_off_rounded : Icons.error_outline_rounded, size: 40, color: MasarColors.muted),
          const SizedBox(height: 12),
          Text(error is ApiException ? error.toString() : tr('Something went wrong.'), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          SizedBox(width: 180, child: OutlinedButton(onPressed: onRetry, child: Text(tr('Try again')))),
        ]),
      ),
    );
  }
}

/// Loading, error with retry, or the data, for a provider's AsyncValue.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.onRetry, required this.data});
  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T) data;

  @override
  Widget build(BuildContext context) => value.when(
        data: data,
        error: (e, _) => ErrorRetry(error: e, onRetry: onRetry),
        loading: () => const Center(child: CircularProgressIndicator()),
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key, this.icon = Icons.inbox_outlined});
  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Column(children: [
          Icon(icon, size: 36, color: MasarColors.muted),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: MasarColors.muted, height: 1.4)),
        ]),
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
        child: Row(children: [
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
          if (trailing != null) trailing!,
        ]),
      );
}

class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.valueStyle, this.onTap});
  final String label;
  final String value;
  final TextStyle? valueStyle;

  /// Makes the value a link, e.g. to a related parcel.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: MasarColors.muted, fontSize: 14)),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: valueStyle ?? TextStyle(fontWeight: FontWeight.w500, fontSize: 14, color: onTap != null ? MasarColors.accent : null),
          ),
        ),
      ]),
    );
    return onTap == null ? row : InkWell(onTap: onTap, child: row);
  }
}

/// A number card, e.g. "12 to deliver".
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.value, required this.label, this.onTap, this.dark = false, this.color});
  final String value;
  final String label;
  final VoidCallback? onTap;
  final bool dark;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final fg = dark ? Colors.white : MasarColors.ink;
    return Material(
      color: dark ? Colors.white.withValues(alpha: 0.1) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: dark ? BorderSide.none : const BorderSide(color: MasarColors.line)),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: color ?? fg, fontFeatures: const [FontFeature.tabularFigures()])),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 13, color: dark ? Colors.white70 : MasarColors.muted)),
          ]),
        ),
      ),
    );
  }
}

/// Tracking numbers, phone numbers and amounts stay left-to-right inside Arabic text.
class Ltr extends StatelessWidget {
  const Ltr(this.text, {super.key, this.style});
  final String text;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Directionality(textDirection: TextDirection.ltr, child: Text(text, style: style));
}

/// A picture served by the API (proof or claim photo), fetched with the sign-in token.
class ApiImage extends ConsumerWidget {
  const ApiImage(this.path, {super.key, this.height = 120, this.fit = BoxFit.cover});
  final String path;
  final double height;
  final BoxFit fit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiProvider);
    final url = api.url(path);
    return GestureDetector(
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(backgroundColor: Colors.black),
          body: InteractiveViewer(child: Center(child: Image.network(url, headers: api.imageHeaders))),
        ),
      )),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.network(
          url,
          headers: api.imageHeaders,
          height: height,
          fit: fit,
          errorBuilder: (_, __, ___) => Container(height: height, width: height, color: MasarColors.line, child: const Icon(Icons.broken_image_outlined, color: MasarColors.muted)),
        ),
      ),
    );
  }
}

class Timeline extends StatelessWidget {
  const Timeline(this.events, {super.key});
  final List<ParcelEvent> events;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) return EmptyState(tr('No history yet.'));
    return Column(
      children: [
        for (var i = 0; i < events.length; i++)
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SizedBox(
                width: 22,
                child: Column(children: [
                  const SizedBox(height: 5),
                  Container(width: 11, height: 11, decoration: BoxDecoration(color: i == 0 ? statusColor(events[i].status) : MasarColors.line, shape: BoxShape.circle)),
                  if (i < events.length - 1) Expanded(child: Container(width: 2, color: MasarColors.line)),
                ]),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tr(statusLabels[events[i].status] ?? events[i].status), style: TextStyle(fontWeight: i == 0 ? FontWeight.w600 : FontWeight.w500)),
                    const SizedBox(height: 2),
                    Text(
                      [dateTime(events[i].at), if (events[i].hub != null) tr(events[i].hub!)].join(' · '),
                      style: const TextStyle(color: MasarColors.muted, fontSize: 13),
                    ),
                    if (events[i].note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(tr(events[i].note), style: const TextStyle(fontSize: 13, color: MasarColors.ink2))),
                  ]),
                ),
              ),
            ]),
          ),
      ],
    );
  }
}

void toast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? MasarColors.danger : MasarColors.navy));
}

/// Runs an action with a spinner on the button's screen and a toast for the result.
Future<T?> runAction<T>(BuildContext context, Future<T> Function() action, {String? done}) async {
  try {
    final r = await action();
    if (context.mounted && done != null) toast(context, done);
    return r;
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
    return null;
  }
}

class CardBox extends StatelessWidget {
  const CardBox({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color});
  final Widget child;
  final EdgeInsets padding;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
          color: color ?? Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: color == null ? Border.all(color: MasarColors.line) : null,
        ),
        child: child,
      );
}
