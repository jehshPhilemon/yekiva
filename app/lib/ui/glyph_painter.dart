import 'package:flutter/material.dart';

/// Dessine une lettre (traits normalisés 0..1) dans un carré.
/// - `progress` : fraction du tracé révélée (0..1) -> animation « voir écrire ».
/// - `dashed` : pointillés -> « suivre le modèle ».
/// - `user` : traits du doigt, en pixels.
class GlyphPainter extends CustomPainter {
  GlyphPainter({
    required this.strokes,
    this.progress = 1.0,
    this.dashed = false,
    this.user = const [],
    this.guideColor = const Color(0xFF9E9E9E),
    this.userColor = const Color(0xFF3949AB),
  });

  final List<List<Offset>> strokes;
  final double progress;
  final bool dashed;
  final List<List<Offset>> user;
  final Color guideColor;
  final Color userColor;

  @override
  void paint(Canvas canvas, Size size) {
    final side = size.shortestSide;
    final scaled = [
      for (final s in strokes) [for (final p in s) Offset(p.dx * side, p.dy * side)],
    ];

    final guide = Paint()
      ..color = guideColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = side * 0.06
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    var total = 0.0;
    for (final s in scaled) {
      for (var i = 1; i < s.length; i++) {
        total += (s[i] - s[i - 1]).distance;
      }
    }
    var remaining = progress.clamp(0.0, 1.0) * total;

    for (final s in scaled) {
      if (s.isEmpty) continue;
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      var cut = false;
      for (var i = 1; i < s.length; i++) {
        final seg = (s[i] - s[i - 1]).distance;
        if (remaining >= seg) {
          path.lineTo(s[i].dx, s[i].dy);
          remaining -= seg;
        } else {
          final t = seg == 0 ? 0.0 : remaining / seg;
          final p = Offset.lerp(s[i - 1], s[i], t)!;
          path.lineTo(p.dx, p.dy);
          remaining = 0;
          cut = true;
          break;
        }
      }
      _draw(canvas, path, guide);
      if (cut) break;
    }

    final pen = Paint()
      ..color = userColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = side * 0.05
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final s in user) {
      if (s.length < 2) continue;
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (final p in s.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, pen);
    }
  }

  void _draw(Canvas canvas, Path path, Paint paint) {
    if (!dashed) {
      canvas.drawPath(path, paint);
      return;
    }
    final dash = paint.strokeWidth * 1.2;
    for (final m in path.computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, d + dash), paint);
        d += dash * 2;
      }
    }
  }

  @override
  bool shouldRepaint(covariant GlyphPainter old) => true;
}
