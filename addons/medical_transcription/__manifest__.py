# -*- coding: utf-8 -*-
{
    'name': 'Medical Transcription',
    'version': '16.0.1.0.0',
    'category': 'Healthcare',
    'summary': 'Medical audio transcription with Flask API integration',
    'description': """
Medical Transcription Module for Odoo 16
=========================================
This module provides a simple interface for:
- Recording or importing medical consultation audio
- Sending audio to a Flask-based transcription API
- Reviewing and editing extracted medical data
- Validating and downloading reports (PDF/JSON)

No patient management - just the transcription workflow.

Docker Configuration:
- For separate containers: use host.docker.internal or container IP
- For same docker-compose: use service name
    """,
    'author': 'LIKSOFT',
    'website': 'https://yourwebsite.com',
    'depends': ['base', 'web'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'report/transcription_report.xml',
        'views/res_config_settings_views.xml',
        'views/menu_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'medical_transcription/static/src/css/transcription.css',
            'medical_transcription/static/src/js/audio_recorder.js',
            'medical_transcription/static/src/js/dynamic_form_editor.js',
            'medical_transcription/static/src/js/transcription_action.js',
            'medical_transcription/static/src/js/transcription_lookup.js',
            'medical_transcription/static/src/xml/transcription_templates.xml',
            'medical_transcription/static/src/xml/transcription_lookup_templates.xml',
        ],
    },
    'external_dependencies': {
        'python': ['requests'],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
