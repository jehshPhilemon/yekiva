import 'learner_model.dart';
import 'pack_repository.dart';
import 'ports.dart';

/// Tout ce dont les écrans ont besoin, regroupé (injection simple, sans bibliothèque).
class Services {
  Services({
    required this.packs,
    required this.speaker,
    required this.transcriber,
    required this.learner,
  });

  final PackRepository packs;
  final Speaker speaker;
  final TranscriptionClient transcriber;
  final LearnerModel learner;

  factory Services.defaults() => Services(
        packs: PackRepository(),
        speaker: DebugSpeaker(),
        transcriber: OfflineTranscriber(),
        learner: LearnerModel(),
      );
}
