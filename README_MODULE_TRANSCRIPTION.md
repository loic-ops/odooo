# Module Odoo - Transcription Médicale

## Contexte

Ce projet Odoo 16 doit intégrer un module qui communique avec une API Flask de transcription médicale existante.

### API Flask (karaoking)
- **Emplacement**: `/Users/isaacalabi/Documents/karaoking`
- **Port**: 5001
- **Container Docker**: `transcript_app`
- **Réseau Docker**: `karaoking_default`

---

## Configuration Docker Actuelle

```yaml
# docker-compose.yml actuel
services:
  web:
    image: liksoft/likos:v16-0-4
    ports: "9000:8069"
    volumes:
      - ./config:/etc/odoo
      - ./addons:/mnt/extra-addons
      - ./logs:/var/log
  db:
    image: postgres:15
```

---

## Tâche à Réaliser

### 1. Mettre à jour docker-compose.yml

Ajouter le réseau externe pour communiquer avec l'API Flask:

```yaml
services:
  web:
    # ... config existante ...
    networks:
      - default
      - karaoking_network

networks:
  default:
    driver: bridge
  karaoking_network:
    external: true
    name: karaoking_default
```

L'API sera alors accessible via: `http://transcript_app:5001`

---

### 2. Créer le module `medical_transcription`

Structure à créer dans `addons/`:

```
addons/
└── medical_transcription/
    ├── __init__.py
    ├── __manifest__.py
    ├── models/
    │   ├── __init__.py
    │   ├── transcription.py
    │   └── api_config.py
    ├── views/
    │   ├── transcription_views.xml
    │   ├── config_views.xml
    │   └── menu_views.xml
    ├── wizards/
    │   ├── __init__.py
    │   └── upload_wizard.py
    ├── security/
    │   └── ir.model.access.csv
    └── static/
        └── description/
            └── icon.png
```

---

## Endpoints API à Utiliser

### POST /api/medical/transcribe
Transcription complète d'un fichier audio.

**Requête**: `multipart/form-data`
- `audio`: fichier audio (mp3, wav, m4a, ogg, webm, flac)
- `transcription_type`: type suggéré (optionnel)

**Réponse**:
```json
{
  "success": true,
  "transcription_id": "1234567890123",
  "whisper_transcription": "texte brut...",
  "cleaned_text": "texte nettoyé...",
  "extracted_data": {
    "motif": "...",
    "diagnostic": "...",
    "prescription": "..."
  },
  "medical_report": "RAPPORT MEDICAL\n...",
  "files": {
    "json": "/transcriptions/xxx_medical.json",
    "txt": "/transcriptions/xxx_medical_report.txt",
    "pdf": "/transcriptions/xxx_medical.pdf"
  }
}
```

### POST /api/medical/validate
Validation du rapport par le médecin.

**Requête** (JSON):
```json
{
  "transcription_id": "1234567890123",
  "validated_report": "RAPPORT VALIDÉ...",
  "validated_data": {"motif": "...", "diagnostic": "..."}
}
```

### POST /api/medical/regenerate
Régénération avec instructions.

**Requête** (JSON):
```json
{
  "parsed_data": {"motif": "...", "diagnostic": "..."},
  "full_text": "transcription originale...",
  "instructions": "Ajouter plus de détails..."
}
```

### GET /api/dictionaries
Liste des dictionnaires de transcription disponibles.

---

## Modèles Odoo à Créer

### medical.transcription
```python
class MedicalTranscription(models.Model):
    _name = 'medical.transcription'
    _description = 'Transcription Médicale'
    _order = 'create_date desc'

    name = fields.Char(string='Référence', required=True, copy=False,
                       readonly=True, default=lambda self: _('New'))
    audio_file = fields.Binary(string='Fichier Audio', required=True)
    audio_filename = fields.Char(string='Nom du fichier')
    transcription_id = fields.Char(string='ID Transcription API', readonly=True)

    state = fields.Selection([
        ('draft', 'Brouillon'),
        ('processing', 'En cours'),
        ('done', 'Terminé'),
        ('validated', 'Validé'),
        ('error', 'Erreur')
    ], default='draft', string='État')

    whisper_text = fields.Text(string='Transcription Brute', readonly=True)
    cleaned_text = fields.Text(string='Texte Nettoyé', readonly=True)
    extracted_data = fields.Text(string='Données Extraites (JSON)', readonly=True)
    medical_report = fields.Text(string='Rapport Médical')
    validated_report = fields.Text(string='Rapport Validé')

    pdf_url = fields.Char(string='URL PDF', readonly=True)
    error_message = fields.Text(string='Message d\'erreur', readonly=True)
    notes = fields.Text(string='Notes')
```

### medical.api.config
```python
class MedicalApiConfig(models.Model):
    _name = 'medical.api.config'
    _description = 'Configuration API Transcription'

    name = fields.Char(string='Nom', default='Configuration API')
    api_url = fields.Char(string='URL de l\'API',
                          default='http://transcript_app:5001')
    timeout = fields.Integer(string='Timeout (secondes)', default=300)
    is_active = fields.Boolean(string='Actif', default=True)
```

---

## Méthodes Clés à Implémenter

### transcription.py

```python
import requests
import base64
import json

def action_transcribe(self):
    """Envoie le fichier audio à l'API et récupère la transcription"""
    config = self.env['medical.api.config'].search([('is_active', '=', True)], limit=1)
    api_url = config.api_url if config else 'http://transcript_app:5001'

    self.state = 'processing'

    try:
        # Décoder le fichier audio
        audio_data = base64.b64decode(self.audio_file)

        # Envoyer à l'API
        files = {'audio': (self.audio_filename, audio_data)}
        response = requests.post(
            f"{api_url}/api/medical/transcribe",
            files=files,
            timeout=config.timeout if config else 300
        )

        if response.status_code == 200:
            data = response.json()
            self.write({
                'transcription_id': data.get('transcription_id'),
                'whisper_text': data.get('whisper_transcription'),
                'cleaned_text': data.get('cleaned_text'),
                'extracted_data': json.dumps(data.get('extracted_data', {}), indent=2),
                'medical_report': data.get('medical_report'),
                'pdf_url': data.get('files', {}).get('pdf'),
                'state': 'done'
            })
        else:
            self.write({
                'state': 'error',
                'error_message': f"Erreur API: {response.status_code}"
            })
    except Exception as e:
        self.write({
            'state': 'error',
            'error_message': str(e)
        })

def action_validate(self):
    """Valide le rapport médical"""
    config = self.env['medical.api.config'].search([('is_active', '=', True)], limit=1)
    api_url = config.api_url if config else 'http://transcript_app:5001'

    try:
        response = requests.post(
            f"{api_url}/api/medical/validate",
            json={
                'transcription_id': self.transcription_id,
                'validated_report': self.medical_report,
                'validated_data': json.loads(self.extracted_data) if self.extracted_data else {}
            },
            timeout=60
        )

        if response.status_code == 200:
            self.write({
                'validated_report': self.medical_report,
                'state': 'validated'
            })
    except Exception as e:
        raise UserError(f"Erreur lors de la validation: {str(e)}")
```

---

## Wizard Upload

```python
# wizards/upload_wizard.py
class TranscriptionUploadWizard(models.TransientModel):
    _name = 'medical.transcription.upload.wizard'
    _description = 'Assistant Upload Audio'

    audio_file = fields.Binary(string='Fichier Audio', required=True)
    audio_filename = fields.Char(string='Nom du fichier')

    def action_upload_and_transcribe(self):
        transcription = self.env['medical.transcription'].create({
            'audio_file': self.audio_file,
            'audio_filename': self.audio_filename,
        })
        transcription.action_transcribe()

        return {
            'type': 'ir.actions.act_window',
            'res_model': 'medical.transcription',
            'res_id': transcription.id,
            'view_mode': 'form',
            'target': 'current',
        }
```

---

## Sécurité (ir.model.access.csv)

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_medical_transcription_user,medical.transcription.user,model_medical_transcription,base.group_user,1,1,1,0
access_medical_api_config_admin,medical.api.config.admin,model_medical_api_config,base.group_system,1,1,1,1
```

---

## __manifest__.py

```python
{
    'name': 'Transcription Médicale',
    'version': '16.0.1.0.0',
    'summary': 'Module de transcription médicale via API',
    'description': 'Intégration avec l\'API de transcription médicale karaoking',
    'author': 'Isaac',
    'category': 'Healthcare',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/config_views.xml',
        'views/transcription_views.xml',
        'views/menu_views.xml',
        'wizards/upload_wizard_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
```

---

## Test de Communication

Pour tester que la communication fonctionne entre Odoo et l'API:

```bash
# 1. Démarrer l'API karaoking (dans /Users/isaacalabi/Documents/karaoking)
docker-compose up -d

# 2. Démarrer Odoo (dans /Users/isaacalabi/Documents/dev)
docker-compose up -d

# 3. Vérifier que les containers sont sur le même réseau
docker network inspect karaoking_default

# 4. Tester depuis le container Odoo
docker exec -it dev-web-1 curl http://transcript_app:5001/api/dictionaries
```

---

## Résumé des Étapes

1. [ ] Mettre à jour `docker-compose.yml` avec le réseau `karaoking_network`
2. [ ] Créer la structure du module dans `addons/medical_transcription/`
3. [ ] Implémenter `__manifest__.py` et `__init__.py`
4. [ ] Créer les modèles `transcription.py` et `api_config.py`
5. [ ] Créer les vues XML (formulaire, liste, menu)
6. [ ] Créer le wizard d'upload
7. [ ] Configurer la sécurité
8. [ ] Tester la communication avec l'API
9. [ ] Installer le module dans Odoo
