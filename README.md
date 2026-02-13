# Medical Transcription - Module Odoo 16

Module Odoo pour la transcription automatique de consultations medicales audio en donnees structurees, developpe pour l'Hopital DOGTA-LAFIE (HDL).

## Architecture

```
Frontend (OWL/JS)  ──RPC──>  Controller (Python)  ──HTTP──>  API Flask (Whisper + IA)
     navigateur                   Odoo                          serveur externe
```

Le **controller** (`controllers/main.py`) est la piece centrale : il fait le pont entre l'interface utilisateur Odoo (frontend) et l'API Flask externe qui effectue la transcription.

---

## Role du Controller (`controllers/main.py`)

Le controller definit **6 routes HTTP** qui servent d'intermediaire entre le frontend JavaScript (OWL) et l'API Flask externe.

### Pourquoi un controller ?

Le frontend JavaScript (navigateur) ne peut pas appeler directement l'API Flask pour deux raisons :
1. **Securite** : les appels passeraient en dehors d'Odoo, sans authentification ni controle d'acces
2. **CORS** : le navigateur bloquerait les appels cross-origin vers un autre serveur

Le controller resout ce probleme en servant de **proxy securise** :

```
Browser JS  ──(RPC JSON)──>  Controller Odoo  ──(HTTP)──>  API Flask
                               - verifie l'auth
                               - decode le base64
                               - met a jour la BDD
                               - gere les erreurs
```

### Les 6 routes

#### 1. `GET /medical_transcription/templates` (type: json)

**Role** : Recuperer la liste des templates medicaux disponibles depuis l'API Flask.

**Flux** :
- Le frontend appelle cette route au chargement de la page
- Le controller fait un `GET` vers `{api_url}/api/medical/templates`
- Retourne la liste des templates (consultation generale, gynecologie, etc.)

**Utilise par** : `transcription_action.js` > methode `loadTemplates()`

---

#### 2. `POST /medical_transcription/transcribe` (type: json)

**Role** : Envoyer un fichier audio a l'API Flask pour transcription et extraction de donnees medicales.

C'est la route la plus complexe. Elle effectue plusieurs operations :

**Etape 1 - Reception des donnees du frontend** :
- `transcription_id` : ID de l'enregistrement Odoo deja cree
- `audio_base64` : le fichier audio encode en base64
- `audio_filename` : nom du fichier (ex: `recording_123.webm`)
- `template_type` : type de template medical choisi
- `template_fields` : liste des champs a extraire

**Etape 2 - Preparation pour l'API Flask** :
- Decode l'audio base64 en bytes
- Formate les champs de template au format attendu par Flask
- Prepare un envoi multipart (fichier + donnees)

**Etape 3 - Appel a l'API Flask** :
- `POST {api_url}/api/medical/transcribe` avec l'audio et les parametres
- L'API Flask utilise Whisper pour transcrire, puis une IA pour extraire les donnees
- Timeout configurable (defaut: 300 secondes)

**Etape 4 - Mise a jour de la BDD Odoo** :
- Stocke la transcription brute (Whisper)
- Stocke le texte nettoye
- Stocke le rapport medical genere
- Stocke les donnees extraites en JSON
- Passe l'etat a `review`

**Etape 5 - Recuperation des fichiers** :
- Telecharge et stocke le PDF genere par Flask (si disponible)
- Telecharge et stocke le JSON genere par Flask (si disponible)

**Utilise par** : `transcription_action.js` > methode `onTranscribe()`

---

#### 3. `POST /medical_transcription/validate` (type: json)

**Role** : Envoyer les donnees validees/corrigees par le medecin a l'API Flask.

**Flux** :
- Le medecin revise et corrige les donnees extraites dans l'interface
- Le frontend envoie les donnees validees + le rapport medical corrige
- Le controller transmet a `POST {api_url}/api/medical/validate`
- Met a jour la BDD Odoo (`validated_data_json`, `state = 'validated'`)
- Recupere le PDF valide si Flask en genere un

**Utilise par** : `transcription_action.js` > methode `onValidate()`

---

#### 4. `GET /medical_transcription/lookup` (type: json)

**Role** : Consulter une transcription existante par son ID API.

**Flux** :
- L'utilisateur saisit un ID de transcription dans l'interface de consultation
- Le controller fait un `GET` vers `{api_url}/api/medical/transcription/{id}`
- Retourne toutes les donnees (patient, champs, rapport, metadonnees)

**Utilise par** : `transcription_lookup.js` > methode `onLookup()`

---

#### 5. `GET /medical_transcription/download/<id>/<type>` (type: http)

**Role** : Permettre le telechargement des fichiers PDF ou JSON stockes dans Odoo.

**Difference** : Cette route est de type `http` (pas `json`) car elle retourne un fichier binaire directement au navigateur, avec les bons headers `Content-Type` et `Content-Disposition` pour declencher le telechargement.

**Utilise par** : `transcription_action.js` > methode `onDownloadJson()` via `window.open()`

---

#### 6. `GET /medical_transcription/report/<id>` (type: http)

**Role** : Generer et telecharger un rapport PDF via le moteur QWeb d'Odoo.

**Difference avec la route 5** : Ici le PDF n'est pas pre-stocke. Il est **genere a la volee** par Odoo a partir du template QWeb `report_transcription_document` (le rapport avec le logo HDL, les sections patient/clinique, la signature).

**Utilise par** : `transcription_action.js` > methode `onDownloadPdf()` via `window.open()`

---

### Methodes utilitaires privees

#### `_get_api_url()`
Recupere l'URL de l'API Flask depuis les parametres systeme Odoo (`ir.config_parameter`).
Defaut : `http://host.docker.internal:5001`

#### `_get_api_timeout()`
Recupere le timeout en secondes. Defaut : 300s (5 minutes).

#### `_download_and_store_file(transcription, file_path, file_type)`
Telecharge un fichier (PDF ou JSON) depuis l'API Flask et le stocke en base64 dans l'enregistrement Odoo.

---

## Schema des routes

```
Frontend JS (OWL)                    Controller Odoo                      API Flask
=================                    ===============                      =========

loadTemplates()
  ──RPC──> /templates ──GET──> /api/medical/templates
                                                        <── liste templates
           <── templates[] ──

onTranscribe()
  ──RPC──> /transcribe ──POST──> /api/medical/transcribe
                          (audio + fields)
                                                        <── transcription + donnees
           update BDD (state=review)
           <── result ──

onValidate()
  ──RPC──> /validate ──POST──> /api/medical/validate
                        (validated_data)
                                                        <── confirmation
           update BDD (state=validated)
           <── result ──

onLookup()
  ──RPC──> /lookup ──GET──> /api/medical/transcription/{id}
                                                        <── donnees completes
           <── result ──

onDownloadPdf()
  ──window.open──> /report/{id}
           QWeb genere le PDF
           <── fichier PDF ──

onDownloadJson()
  ──window.open──> /download/{id}/json
           <── fichier JSON ──
```

---

## Configuration

L'URL et le timeout de l'API Flask sont configurables dans :
**Transcription Medicale > Configuration > Parametres API**

| Parametre | Defaut | Description |
|-----------|--------|-------------|
| API URL | `http://host.docker.internal:5001` | URL du serveur Flask |
| API Timeout | `300` secondes | Timeout pour la transcription |

---

## Installation

```bash
# Dependance Python requise
pip install requests

# Mise a jour du module dans Odoo
./odoo-bin -u medical_transcription -d <database>
```

---

## Stack technique

- **Backend** : Odoo 16, Python 3.9
- **Frontend** : OWL (Odoo Web Library), Bootstrap 5
- **API externe** : Flask + Whisper (Speech-to-Text) + IA (extraction de donnees)
- **Rapports PDF** : QWeb + wkhtmltopdf
