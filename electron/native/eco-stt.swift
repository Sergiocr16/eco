// eco-stt — STT CLI nativa para macOS usando Apple Speech framework.
//
// Toma un archivo de audio (WAV / m4a / cualquier cosa que AVFoundation pueda
// decodificar) y devuelve la transcripción por stdout. Errores por stderr.
//
// Usage: eco-stt <audio-file> [locale]
//   audio-file: path absoluto al audio
//   locale:     opcional, default "es-MX" (también "es-ES", "en-US", etc.)
//
// Salida exitosa: el texto transcrito en stdout, exit 0.
// Sin audio detectado: stdout vacío, exit 0 (no es error).
// Errores: descripción en stderr, exit > 0.
//
// On-device recognition: pedimos a Apple que use modelo local (sin enviar
// nada a Apple). En macOS 14+ funciona para los locales que el user descargó
// en Ajustes → Accesibilidad → Contenido hablado.

import Foundation
import Speech

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write("Usage: eco-stt <audio-file> [locale]\n".data(using: .utf8)!)
    exit(1)
}

let audioPath = CommandLine.arguments[1]
let localeStr = CommandLine.arguments.count >= 3 ? CommandLine.arguments[2] : "es-MX"
let url = URL(fileURLWithPath: audioPath)

guard FileManager.default.fileExists(atPath: audioPath) else {
    FileHandle.standardError.write("File not found: \(audioPath)\n".data(using: .utf8)!)
    exit(2)
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeStr)) else {
    FileHandle.standardError.write("Recognizer not available for locale \(localeStr)\n".data(using: .utf8)!)
    exit(3)
}

// Espera de autorización — solo bloquea la primera ejecución cuando macOS
// muestra el prompt al user. Después queda cacheada la decisión.
if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
    let authSem = DispatchSemaphore(value: 0)
    SFSpeechRecognizer.requestAuthorization { _ in authSem.signal() }
    _ = authSem.wait(timeout: .now() + 30)
}

switch SFSpeechRecognizer.authorizationStatus() {
case .authorized: break
case .denied:
    FileHandle.standardError.write("Speech recognition denied by user (System Settings → Privacy → Speech Recognition)\n".data(using: .utf8)!)
    exit(4)
case .restricted:
    FileHandle.standardError.write("Speech recognition restricted on this device\n".data(using: .utf8)!)
    exit(4)
case .notDetermined:
    FileHandle.standardError.write("Authorization status undetermined after request\n".data(using: .utf8)!)
    exit(4)
@unknown default:
    FileHandle.standardError.write("Unknown authorization status\n".data(using: .utf8)!)
    exit(4)
}

guard recognizer.isAvailable else {
    FileHandle.standardError.write("Recognizer not available right now\n".data(using: .utf8)!)
    exit(5)
}

let request = SFSpeechURLRecognitionRequest(url: url)
// On-device cuando esté disponible — sin internet, sin enviar audio a Apple.
if recognizer.supportsOnDeviceRecognition {
    request.requiresOnDeviceRecognition = true
}
request.shouldReportPartialResults = false

var transcript = ""
var errOut: Error? = nil
var done = false

// Importante: SFSpeechRecognizer entrega resultados via callbacks que
// requieren un CFRunLoop activo. `DispatchSemaphore.wait` bloquea el run loop
// y los callbacks nunca llegan. Por eso usamos CFRunLoopRunInMode.
let task = recognizer.recognitionTask(with: request) { result, error in
    if let error = error {
        // .noSpeechDetected (kAFAssistantErrorDomain 1110) = audio sin habla,
        // no es error real — devolvemos string vacío y exit 0.
        let ns = error as NSError
        if ns.domain == "kAFAssistantErrorDomain" && ns.code == 1110 {
            done = true
            CFRunLoopStop(CFRunLoopGetCurrent())
            return
        }
        errOut = error
        done = true
        CFRunLoopStop(CFRunLoopGetCurrent())
        return
    }
    if let result = result, result.isFinal {
        transcript = result.bestTranscription.formattedString
        done = true
        CFRunLoopStop(CFRunLoopGetCurrent())
    }
}

// Timeout de seguridad: 30s es más que suficiente para chunks de 2-5s.
let deadline = Date().addingTimeInterval(30)
while !done && Date() < deadline {
    CFRunLoopRunInMode(.defaultMode, 0.5, true)
}

if !done {
    task.cancel()
    FileHandle.standardError.write("Transcription timeout\n".data(using: .utf8)!)
    exit(6)
}

if let e = errOut {
    FileHandle.standardError.write("\(e.localizedDescription)\n".data(using: .utf8)!)
    exit(7)
}

print(transcript)
