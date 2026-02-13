# -*- coding: utf-8 -*-
from odoo import models, fields


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    medical_transcription_api_url = fields.Char(
        string='API URL',
        config_parameter='medical_transcription.api_url',
        default='http://host.docker.internal:5001',
        help='Base URL of the Flask transcription API. '
             'For Docker: use host.docker.internal (Mac/Windows) or container IP (Linux)'
    )

    medical_transcription_api_timeout = fields.Integer(
        string='API Timeout (seconds)',
        config_parameter='medical_transcription.api_timeout',
        default=300,
        help='Timeout for transcription requests in seconds (default: 300)'
    )
