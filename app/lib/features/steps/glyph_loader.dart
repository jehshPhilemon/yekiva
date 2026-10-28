import 'package:flutter/material.dart';

import '../../core/step_registry.dart';

/// Charge les traits du glyphe demandé par l'étape (`params.glyph`) puis construit le widget.
/// Le chargement n'est fait qu'une fois, même si le parent se reconstruit.
class GlyphLoader extends StatefulWidget {
  const GlyphLoader({super.key, required this.ctx, required this.builder});

  final StepContext ctx;
  final Widget Function(BuildContext context, List<List<Offset>> strokes) builder;

  @override
  State<GlyphLoader> createState() => _GlyphLoaderState();
}

class _GlyphLoaderState extends State<GlyphLoader> {
  late final Future<Map<String, List<List<Offset>>>> _glyphs =
      widget.ctx.services.packs.loadGlyphs(widget.ctx.pack);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, List<List<Offset>>>>(
      future: _glyphs,
      builder: (context, snap) {
        if (snap.hasError) return const Center(child: Icon(Icons.error_outline, size: 96));
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final strokes = snap.data![widget.ctx.step.params['glyph'] as String];
        if (strokes == null) return const Center(child: Icon(Icons.error_outline, size: 96));
        return widget.builder(context, strokes);
      },
    );
  }
}
