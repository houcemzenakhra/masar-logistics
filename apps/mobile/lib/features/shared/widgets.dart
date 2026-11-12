import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/theme.dart';

class MasarLogo extends StatelessWidget {
  const MasarLogo({super.key, this.light = false});
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(color: MasarColors.accent, borderRadius: BorderRadius.circular(9)),
          child: const Icon(Icons.route_rounded, color: Colors.white, size: 19),
        ),
        const SizedBox(width: 8),
        Text('masar',
            style: TextStyle(
              color: light ? Colors.white : MasarColors.ink,
              fontSize: 20,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.4,
            )),
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
      return MasarColors.info;
    default:
      return MasarColors.muted;
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
      child: Text(statusLabels[status] ?? status, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

/// Loading, error with retry, or content, for any AsyncValue-like state.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 40, color: MasarColors.muted),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: MasarColors.muted)),
    );
  }
}

void toast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? MasarColors.danger : MasarColors.navy,
    ));
}
