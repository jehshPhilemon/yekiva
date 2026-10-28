import 'package:flutter/material.dart';

/// Grosse zone tactile avec une icône : l'unité de base d'une interface sans texte.
class BigTile extends StatelessWidget {
  const BigTile({
    super.key,
    required this.icon,
    required this.onTap,
    this.color,
    this.size = 96,
  });

  final IconData icon;
  final VoidCallback onTap;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final bg = color ?? Theme.of(context).colorScheme.primaryContainer;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(28),
        child: InkWell(
          borderRadius: BorderRadius.circular(28),
          onTap: onTap,
          child: SizedBox.expand(child: Center(child: Icon(icon, size: size))),
        ),
      ),
    );
  }
}
