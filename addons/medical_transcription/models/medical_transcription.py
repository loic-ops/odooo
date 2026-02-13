# -*- coding: utf-8 -*-
from odoo import models, fields, api
from markupsafe import Markup
import json


class MedicalTranscription(models.Model):
    _name = 'medical.transcription'
    _description = 'Medical Transcription Session'
    _order = 'create_date desc'

    name = fields.Char(
        string='Reference',
        required=True,
        copy=False,
        readonly=True,
        default=lambda self: 'New'
    )

    # Template selection (stored as code from API)
    template_type = fields.Char(string='Template Type')
    template_name = fields.Char(string='Template Name')

    # Audio storage
    audio_file = fields.Binary(string='Audio File', attachment=True)
    audio_filename = fields.Char(string='Audio Filename')

    # API Response Data
    api_transcription_id = fields.Char(string='API Transcription ID', readonly=True)
    whisper_transcription = fields.Text(string='Raw Transcription', readonly=True)
    cleaned_text = fields.Text(string='Cleaned Text', readonly=True)
    medical_report = fields.Text(string='Medical Report')

    # Extracted data stored as JSON
    extracted_data_json = fields.Text(string='Extracted Data (JSON)')
    validated_data_json = fields.Text(string='Validated Data (JSON)')

    # Template fields definition (cached from API)
    template_fields_json = fields.Text(string='Template Fields (JSON)')

    # Generated files
    pdf_file = fields.Binary(string='PDF Report', attachment=True)
    pdf_filename = fields.Char(string='PDF Filename')
    json_file = fields.Binary(string='JSON Data', attachment=True)
    json_filename = fields.Char(string='JSON Filename')

    # State management
    state = fields.Selection([
        ('draft', 'Draft'),
        ('recording', 'Recording'),
        ('transcribing', 'Transcribing'),
        ('review', 'Review'),
        ('validated', 'Validated'),
        ('error', 'Error')
    ], string='State', default='draft', required=True)

    error_message = fields.Text(string='Error Message')

    # Computed HTML fields for formatted JSON display
    extracted_data_html = fields.Html(
        string='Extracted Data (Formatted)',
        compute='_compute_extracted_data_html',
        sanitize=False,
    )
    validated_data_html = fields.Html(
        string='Validated Data (Formatted)',
        compute='_compute_validated_data_html',
        sanitize=False,
    )

    @api.depends('extracted_data_json')
    def _compute_extracted_data_html(self):
        for record in self:
            record.extracted_data_html = record._json_to_html(record.extracted_data_json)

    @api.depends('validated_data_json')
    def _compute_validated_data_html(self):
        for record in self:
            record.validated_data_html = record._json_to_html(record.validated_data_json)

    def _json_to_html(self, json_string):
        """Convert a JSON string to a formatted HTML table"""
        if not json_string:
            return Markup('<p style="color: #999; text-align: center; padding: 20px;">Aucune donnee</p>')
        try:
            data = json.loads(json_string)
        except (json.JSONDecodeError, TypeError):
            return Markup('<pre>%s</pre>') % json_string

        if not isinstance(data, dict):
            return Markup('<pre>%s</pre>') % json.dumps(data, indent=4, ensure_ascii=False)

        rows = []
        for key, value in data.items():
            label = key.replace('_', ' ').title()
            if isinstance(value, (dict, list)):
                display_value = json.dumps(value, indent=2, ensure_ascii=False)
                val_html = '<pre style="margin:0; background:#f8f9fa; padding:8px; border-radius:4px; white-space:pre-wrap;">%s</pre>' % display_value
            else:
                val_html = '<span>%s</span>' % (value if value else '<em style="color:#999;">-</em>')
            rows.append(
                '<tr>'
                '<td style="padding:10px 14px; width:30%%; font-weight:600; color:#495057; '
                'vertical-align:top; border-bottom:1px solid #e9ecef; background:#f8f9fa;">%s</td>'
                '<td style="padding:10px 14px; color:#212529; border-bottom:1px solid #e9ecef; '
                'white-space:pre-wrap;">%s</td>'
                '</tr>' % (label, val_html)
            )

        html = (
            '<div style="border:1px solid #dee2e6; border-radius:8px; overflow:hidden;">'
            '<table style="width:100%%; border-collapse:collapse; font-size:14px;">'
            '%s'
            '</table>'
            '</div>'
        ) % ''.join(rows)

        return Markup(html)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'medical.transcription'
                ) or 'New'
        return super().create(vals_list)

    PATIENT_INFO_KEYS = [
        'nom', 'prenom', 'age', 'sexe', 'date_de_naissance',
        'numero_securite_sociale', 'adresse', 'telephone',
        'histoire_de_la_maladie', 'antecedents',
        'allergies', 'profession', 'situation_familiale',
        'motif_de_consultation', 'motif',
    ]

    def get_extracted_data(self):
        """Return extracted data as Python dict, preferring validated data"""
        if self.validated_data_json:
            return json.loads(self.validated_data_json)
        if self.extracted_data_json:
            return json.loads(self.extracted_data_json)
        return {}

    def get_patient_info(self):
        """Return patient identification fields only"""
        data = self.get_extracted_data()
        return {k: v for k, v in data.items()
                if k.lower() in self.PATIENT_INFO_KEYS}

    def get_clinical_data(self):
        """Return clinical observation fields only"""
        data = self.get_extracted_data()
        return {k: v for k, v in data.items()
                if k.lower() not in self.PATIENT_INFO_KEYS}

    def get_template_fields(self):
        """Return template fields as Python list"""
        if self.template_fields_json:
            return json.loads(self.template_fields_json)
        return []

    def set_extracted_data(self, data):
        """Store extracted data as JSON"""
        self.extracted_data_json = json.dumps(data, ensure_ascii=False)

    def set_template_fields(self, fields):
        """Store template fields as JSON"""
        self.template_fields_json = json.dumps(fields, ensure_ascii=False)
