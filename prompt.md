# Prompt pour intégration Odoo - Système de transcription médicale

## Contexte

J'ai une API Flask de transcription médicale qui tourne sur `http://localhost:5000` (ou en production sur une autre URL). Cette API permet de :

1. **Transcrire des audios médicaux** avec extraction intelligente des données
2. **Utiliser des templates de notes** (Consultation médicale, Note simple, ou templates custom)
3. **Extraire les données selon le template choisi** via Mistral AI

Je veux modifier le module Odoo actuel pour interagir avec cette API. **Pas besoin de gérer les patients** - juste l'enregistrement audio et le formulaire d'extraction des données.

---

## API disponible

### 1. GET /api/medical/templates
Liste les templates de notes disponibles.

**Réponse:**
```json
{
  "success": true,
  "templates": [
    {
      "type": "consultation",
      "display_name": "Consultation Médicale",
      "description": "Consultation médicale complète",
      "fields": [
        {"key": "mdc", "label": "Motif de consultation (MDC)", "required": true},
        {"key": "atcd", "label": "Antécédents (ATCD)", "required": false},
        {"key": "hdm", "label": "Histoire de la maladie (HDM)", "required": false},
        {"key": "examen_physique", "label": "Examen physique", "required": false},
        {"key": "resume_syndromique", "label": "Résumé syndromique", "required": false},
        {"key": "examens_paracliniques", "label": "Examens paracliniques", "required": false},
        {"key": "hypotheses_diagnostiques", "label": "Hypothèses diagnostiques", "required": false},
        {"key": "commentaires", "label": "Commentaires", "required": false}
      ],
      "is_custom": false
    },
    {
      "type": "note_simple",
      "display_name": "Note Simple",
      "description": "Note libre avec extraction automatique",
      "fields": [],
      "is_custom": false
    }
  ],
  "count": 2
}
```

### 2. POST /api/medical/transcribe
Transcrit un audio et extrait les données selon le template.

**Payload (multipart/form-data):**
```
audio: fichier audio (requis) - formats: mp3, wav, m4a, ogg, webm, mp4, flac, aac
note_type: "consultation" | "note_simple" | custom (défaut: "note_simple")
input_language: "fr" | "en" (défaut: "fr")
output_language: "fr" | "en" (défaut: "fr")
```

**Réponse:**
```json
{
  "success": true,
  "transcription_id": "1706712345678",
  "note_type": "consultation",
  "template": {
    "display_name": "Consultation Médicale",
    "description": "Consultation médicale complète",
    "fields": [...]
  },
  "whisper_transcription": "Texte brut de la transcription...",
  "cleaned_text": "Texte nettoyé et structuré...",
  "extracted_data": {
    "mdc": "Douleurs thoraciques depuis 3 jours",
    "atcd": "Hypertension artérielle, diabète type 2",
    "hdm": "Patient de 45 ans qui consulte pour des douleurs thoraciques...",
    "examen_physique": "TA: 140/90, FC: 88/min, auscultation cardiaque normale",
    "resume_syndromique": null,
    "examens_paracliniques": "ECG demandé, bilan sanguin",
    "hypotheses_diagnostiques": "Angor d'effort à explorer",
    "commentaires": "Rendez-vous cardiologue recommandé"
  },
  "medical_report": "RAPPORT DE CONSULTATION MÉDICALE\n...",
  "files": {
    "json": "/transcriptions/1706712345678_medical.json",
    "txt": "/transcriptions/1706712345678_medical_report.txt",
    "pdf": "/transcriptions/1706712345678_medical.pdf"
  },
  "metadata": {
    "ai_enhanced": true,
    "extraction_mode": "template",
    "fields_extracted": ["mdc", "atcd", "hdm", ...],
    "llm_model": "mistral"
  }
}
```

### 3. POST /api/medical/validate
Valide et sauvegarde les données modifiées.

**Body JSON:**
```json
{
  "transcription_id": "1706712345678",
  "validated_report": "Rapport final modifié...",
  "validated_data": {
    "mdc": "Valeur corrigée",
    "atcd": "Valeur corrigée"
  }
}
```

---

## Ce que je veux dans Odoo

### Workflow simple (sans gestion patient)

1. L'utilisateur choisit un **type de note** (dropdown avec les templates)
2. L'utilisateur **enregistre ou importe un audio**
3. Clic sur **"Transcrire"** → appel API → affichage des résultats
4. **Formulaire dynamique** avec les champs extraits (générés selon le template)
5. L'utilisateur peut **modifier** les valeurs extraites
6. Clic sur **"Valider"** → sauvegarde finale
7. **Téléchargement** du PDF/JSON

### Vue principale

```
┌─────────────────────────────────────────────────────────────┐
│  TRANSCRIPTION MÉDICALE                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Type de note: [▼ Consultation Médicale    ]               │
│                                                             │
│  ┌─── Enregistrement Audio ───┐                            │
│  │  🎤 [ENREGISTRER]  ou  📁 [IMPORTER FICHIER]           │
│  │                                                         │
│  │  [============================] 00:45                   │
│  │  ▶️ Lecture   ⏹️ Stop   🗑️ Supprimer                    │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│  [TRANSCRIRE]                                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📋 DONNÉES EXTRAITES (après transcription)                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Motif de consultation (MDC) *                       │   │
│  │ [____________________________________________________]  │
│  │                                                     │   │
│  │ Antécédents (ATCD)                                  │   │
│  │ [____________________________________________________]  │
│  │                                                     │   │
│  │ Histoire de la maladie (HDM)                        │   │
│  │ [____________________________________________________]  │
│  │                                                     │   │
│  │ ... (champs générés dynamiquement selon template)   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  📝 TRANSCRIPTION BRUTE          [Afficher/Masquer]        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Texte brut de Whisper (lecture seule)...            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [VALIDER ET SAUVEGARDER]                                  │
│                                                             │
│  📥 Téléchargements:  [PDF]  [JSON]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Comportement attendu

1. **Au chargement** :
   - Appeler `GET /api/medical/templates` pour remplir le dropdown des types de notes
   - Afficher uniquement la section audio + bouton Transcrire

2. **Au clic sur "Transcrire"** :
   - Envoyer l'audio + note_type à `POST /api/medical/transcribe`
   - Afficher un loader pendant le traitement
   - Une fois la réponse reçue, **générer dynamiquement le formulaire** avec les champs du template
   - Remplir les champs avec les valeurs de `extracted_data`

3. **Formulaire dynamique** :
   - Les champs sont créés selon `template.fields` de la réponse
   - Chaque champ a : key, label, required (marqué avec *)
   - Les champs sont éditables (textarea)

4. **Au clic sur "Valider"** :
   - Collecter les valeurs du formulaire
   - Appeler `POST /api/medical/validate` avec les données modifiées
   - Afficher message de succès

5. **Téléchargements** :
   - Liens vers les fichiers PDF/JSON générés par l'API

---

## Fonctionnalités JavaScript requises

### Widget d'enregistrement audio
```javascript
// Fonctionnalités:
// - Enregistrement via microphone (MediaRecorder API)
// - Affichage durée d'enregistrement
// - Boutons: Enregistrer/Stop/Lecture/Supprimer
// - Import fichier audio (input file)
// - Stockage du blob audio pour envoi à l'API
```

### Génération dynamique du formulaire
```javascript
// Après réponse API, générer les champs:
// template.fields.forEach(field => {
//   // Créer textarea avec:
//   // - name = field.key
//   // - label = field.label
//   // - required = field.required
//   // - value = extracted_data[field.key] || ''
// });
```

### Appels API
```javascript
// POST multipart/form-data pour transcription
// POST JSON pour validation
// Gestion erreurs et loader
```

---

## Contraintes

1. **PAS de gestion patient** - On envoie juste l'audio et le type de note
2. **Formulaire dynamique** - Les champs sont générés selon le template choisi
3. **L'API Flask tourne séparément** - Odoo fait des appels HTTP
4. **CORS activé** sur l'API Flask
5. **Version Odoo** : [PRÉCISER TA VERSION - 16]

---

## Demande

Modifie/crée les composants Odoo nécessaires pour :

1. **Vue avec widget audio** - Enregistrement/import + sélection type de note
2. **Appel API transcription** - Envoi audio, réception données extraites
3. **Formulaire dynamique** - Génération des champs selon le template, édition des valeurs
4. **Validation** - Envoi des données modifiées à l'API
5. **Téléchargements** - Liens PDF/JSON

Le tout doit être simple et fonctionnel - l'essentiel est géré par l'API Flask, Odoo sert d'interface utilisateur.
