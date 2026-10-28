// Frontières avec le monde extérieur. L'app ne dépend que de ces interfaces :
// on branche le vrai micro / la vraie synthèse / le serveur sans toucher aux écrans.
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;

abstract class Speaker {
  /// Joue `audioAsset` s'il existe, sinon la synthèse vocale du téléphone avec `text`.
  Future<void> say({String? audioAsset, String? text, String? lang});
}

abstract class Recorder {
  Future<void> start();
  Future<Uint8List> stop();
}

abstract class TranscriptionClient {
  /// Retourne null si hors-ligne ou en erreur : l'appelant bascule alors sur « écoute et touche ».
  Future<String?> transcribe(Uint8List audio, {String? lang});
}

class DebugSpeaker implements Speaker {
  @override
  Future<void> say({String? audioAsset, String? text, String? lang}) async {
    debugPrint('[speaker] audio=$audioAsset text=$text lang=$lang');
  }
}

class OfflineTranscriber implements TranscriptionClient {
  @override
  Future<String?> transcribe(Uint8List audio, {String? lang}) async => null;
}
