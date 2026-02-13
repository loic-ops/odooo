# -*- coding: utf-8 -*-
import json
import base64
import logging
import traceback

try:
    import requests
except ImportError:
    requests = None

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class TranscriptionController(http.Controller):

    def _get_api_url(self):
        """Get API base URL from system parameters"""
        return request.env['ir.config_parameter'].sudo().get_param(
            'medical_transcription.api_url',
            default='http://host.docker.internal:5001'
        )

    def _get_api_timeout(self):
        """Get API timeout from system parameters"""
        return int(request.env['ir.config_parameter'].sudo().get_param(
            'medical_transcription.api_timeout',
            default='300'
        ))

    @http.route('/medical_transcription/templates', type='json', auth='user')
    def get_templates(self):
        """Fetch available templates from Flask API"""
        try:
            if requests is None:
                return {'success': False, 'error': 'requests library not installed'}

            api_url = self._get_api_url()
            _logger.info(f"Fetching templates from {api_url}/api/medical/templates")

            response = requests.get(
                f'{api_url}/api/medical/templates',
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            _logger.error(f"Error fetching templates: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            _logger.error(f"Unexpected error fetching templates: {e}\n{traceback.format_exc()}")
            return {'success': False, 'error': f"Unexpected error: {str(e)}"}

    @http.route('/medical_transcription/lookup', type='json', auth='user')
    def lookup_transcription(self, api_transcription_id):
        """Fetch full transcription details from Flask API by transcription ID"""
        try:
            if requests is None:
                return {'success': False, 'error': 'requests library not installed'}

            if not api_transcription_id:
                return {'success': False, 'error': 'Missing transcription ID'}

            api_url = self._get_api_url()
            _logger.info(f"Looking up transcription {api_transcription_id} from {api_url}")

            response = requests.get(
                f'{api_url}/api/medical/transcription/{api_transcription_id}',
                timeout=30
            )

            if response.status_code == 404:
                return {'success': False, 'error': f'Transcription "{api_transcription_id}" non trouvee sur l\'API.'}
            response.raise_for_status()
            return response.json()
        except requests.ConnectionError:
            _logger.error(f"Cannot connect to API at {api_url}")
            return {'success': False, 'error': f'Impossible de se connecter a l\'API ({api_url}). Verifiez que le serveur Flask est en cours d\'execution.'}
        except requests.RequestException as e:
            _logger.error(f"Error looking up transcription: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            _logger.error(f"Unexpected error looking up transcription: {e}\n{traceback.format_exc()}")
            return {'success': False, 'error': f"Unexpected error: {str(e)}"}

    @http.route('/medical_transcription/transcribe', type='json', auth='user')
    def transcribe(self, **kwargs):
        """Send audio to Flask API for transcription"""
        # Extract parameters from kwargs
        transcription_id = kwargs.get('transcription_id')
        audio_base64 = kwargs.get('audio_base64', '')
        audio_filename = kwargs.get('audio_filename', 'audio.wav')
        template_type = kwargs.get('template_type', '')
        template_fields = kwargs.get('template_fields', [])
        input_language = kwargs.get('input_language', 'fr')
        output_language = kwargs.get('output_language', 'fr')

        _logger.info(f"=== TRANSCRIBE START === id={transcription_id}, file={audio_filename}, type={template_type}")
        _logger.info(f"Received kwargs keys: {list(kwargs.keys())}")

        try:
            if not transcription_id:
                return {'success': False, 'error': 'Missing transcription_id'}
            if not audio_base64:
                return {'success': False, 'error': 'Missing audio_base64'}

            if requests is None:
                _logger.error("requests library not installed")
                return {'success': False, 'error': 'requests library not installed in Odoo container'}

            api_url = self._get_api_url()
            timeout = self._get_api_timeout()
            _logger.info(f"API URL: {api_url}, Timeout: {timeout}")

            # Decode base64 audio
            _logger.info(f"Decoding audio base64 (length: {len(audio_base64)})")
            try:
                audio_bytes = base64.b64decode(audio_base64)
                _logger.info(f"Audio decoded, size: {len(audio_bytes)} bytes")
            except Exception as e:
                _logger.error(f"Failed to decode audio: {e}")
                return {'success': False, 'error': f'Failed to decode audio: {str(e)}'}

            # Get template fields from the transcription record if not provided
            if template_fields is None:
                try:
                    transcription = request.env['medical.transcription'].browse(transcription_id)
                    if transcription.template_fields_json:
                        template_fields = json.loads(transcription.template_fields_json)
                except:
                    template_fields = []

            # Convert template fields to the format expected by Flask API
            fields_for_api = []
            if template_fields:
                for field in template_fields:
                    if isinstance(field, dict):
                        fields_for_api.append({
                            'key': field.get('key', ''),
                            'label': field.get('label', field.get('key', ''))
                        })
                    elif isinstance(field, str):
                        fields_for_api.append(field)

            # Prepare multipart form data
            files = {
                'audio': (audio_filename, audio_bytes)
            }
            data = {
                'fields': json.dumps(fields_for_api) if fields_for_api else '[]',
                'allow_additional': 'true',
                'input_language': input_language,
                'output_language': output_language
            }
            _logger.info(f"Calling Flask API: POST {api_url}/api/medical/transcribe with fields: {fields_for_api}")

            # Call Flask API
            try:
                response = requests.post(
                    f'{api_url}/api/medical/transcribe',
                    files=files,
                    data=data,
                    timeout=timeout
                )
                _logger.info(f"Flask API response status: {response.status_code}")
                response.raise_for_status()
                result = response.json()
                _logger.info(f"Flask API response success: {result.get('success')}")
            except requests.Timeout as e:
                _logger.error(f"API timeout after {timeout}s: {e}")
                return {'success': False, 'error': f'API timeout after {timeout} seconds'}
            except requests.ConnectionError as e:
                _logger.error(f"Cannot connect to API at {api_url}: {e}")
                return {'success': False, 'error': f'Cannot connect to API at {api_url}. Check if Flask is running and URL is correct.'}
            except requests.RequestException as e:
                _logger.error(f"API request error: {e}")
                return {'success': False, 'error': f'API request error: {str(e)}'}

            # Update transcription record
            if result.get('success'):
                _logger.info(f"Updating Odoo record {transcription_id}")
                try:
                    transcription = request.env['medical.transcription'].browse(
                        transcription_id
                    )

                    # Combine all extracted data
                    extracted_data = result.get('extracted_data', {})
                    # Also include requested_fields and additional_fields if present
                    if result.get('requested_fields'):
                        extracted_data.update(result.get('requested_fields', {}))
                    if result.get('additional_fields'):
                        extracted_data.update(result.get('additional_fields', {}))

                    transcription.write({
                        'api_transcription_id': result.get('transcription_id'),
                        'whisper_transcription': result.get('whisper_transcription') or result.get('full_text', ''),
                        'cleaned_text': result.get('cleaned_text', ''),
                        'medical_report': result.get('medical_report', ''),
                        'extracted_data_json': json.dumps(
                            extracted_data,
                            ensure_ascii=False
                        ),
                        'state': 'review'
                    })
                    _logger.info(f"Record {transcription_id} updated successfully")

                    # Add template info to result for frontend
                    result['template'] = {
                        'fields': template_fields if template_fields else []
                    }

                except Exception as e:
                    _logger.error(f"Failed to update record: {e}\n{traceback.format_exc()}")
                    return {'success': False, 'error': f'Failed to update record: {str(e)}'}

                # Download and store PDF if available
                if result.get('files', {}).get('pdf'):
                    self._download_and_store_file(
                        transcription,
                        result['files']['pdf'],
                        'pdf'
                    )

                # Download and store JSON if available
                if result.get('files', {}).get('json'):
                    self._download_and_store_file(
                        transcription,
                        result['files']['json'],
                        'json'
                    )

            _logger.info(f"=== TRANSCRIBE END === success={result.get('success')}")
            return result

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            _logger.error(f"TRANSCRIBE ERROR: {error_msg}\n{traceback.format_exc()}")

            # Try to update record with error state
            try:
                transcription = request.env['medical.transcription'].browse(transcription_id)
                transcription.write({
                    'state': 'error',
                    'error_message': error_msg
                })
            except:
                pass

            return {'success': False, 'error': error_msg}

    @http.route('/medical_transcription/validate', type='json', auth='user')
    def validate(self, transcription_id, validated_data, validated_report):
        """Send validated data to Flask API"""
        try:
            if requests is None:
                return {'success': False, 'error': 'requests library not installed'}

            api_url = self._get_api_url()

            transcription = request.env['medical.transcription'].browse(
                transcription_id
            )

            payload = {
                'transcription_id': transcription.api_transcription_id,
                'validated_report': validated_report,
                'validated_data': validated_data
            }

            _logger.info(f"Validating transcription {transcription_id}")

            response = requests.post(
                f'{api_url}/api/medical/validate',
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            result = response.json()

            if result.get('success'):
                transcription.write({
                    'validated_data_json': json.dumps(
                        validated_data,
                        ensure_ascii=False
                    ),
                    'medical_report': validated_report,
                    'state': 'validated'
                })

                # Download validated PDF if available
                if result.get('files', {}).get('validated_pdf'):
                    self._download_and_store_file(
                        transcription,
                        result['files']['validated_pdf'],
                        'pdf'
                    )

            return result

        except requests.RequestException as e:
            _logger.error(f"Error validating transcription: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            _logger.error(f"Unexpected error validating: {e}\n{traceback.format_exc()}")
            return {'success': False, 'error': f"Unexpected error: {str(e)}"}

    @http.route(
        '/medical_transcription/download/<int:transcription_id>/<string:file_type>',
        type='http',
        auth='user'
    )
    def download_file(self, transcription_id, file_type):
        """Download generated files (PDF/JSON)"""
        transcription = request.env['medical.transcription'].browse(
            transcription_id
        )

        if file_type == 'pdf' and transcription.pdf_file:
            return request.make_response(
                base64.b64decode(transcription.pdf_file),
                headers=[
                    ('Content-Type', 'application/pdf'),
                    ('Content-Disposition',
                     f'attachment; filename="{transcription.pdf_filename}"')
                ]
            )
        elif file_type == 'json' and transcription.json_file:
            return request.make_response(
                base64.b64decode(transcription.json_file),
                headers=[
                    ('Content-Type', 'application/json'),
                    ('Content-Disposition',
                     f'attachment; filename="{transcription.json_filename}"')
                ]
            )

        return request.not_found()

    @http.route(
        '/medical_transcription/report/<int:transcription_id>',
        type='http',
        auth='user'
    )
    def download_report(self, transcription_id):
        """Generate and download PDF report using Odoo QWeb"""
        try:
            transcription = request.env['medical.transcription'].browse(
                transcription_id
            )
            if not transcription.exists():
                return request.not_found()

            # Generate PDF using Odoo's report engine
            report = request.env.ref('medical_transcription.action_report_medical_transcription')
            pdf_content, _ = report._render_qweb_pdf(
                'medical_transcription.report_transcription_document',
                [transcription_id]
            )

            filename = f"Rapport_Medical_{transcription.name}.pdf"

            return request.make_response(
                pdf_content,
                headers=[
                    ('Content-Type', 'application/pdf'),
                    ('Content-Disposition', f'attachment; filename="{filename}"')
                ]
            )
        except Exception as e:
            _logger.error(f"Error generating PDF report: {e}\n{traceback.format_exc()}")
            return request.not_found()

    def _download_and_store_file(self, transcription, file_path, file_type):
        """Download file from Flask API and store in Odoo"""
        try:
            api_url = self._get_api_url()
            _logger.info(f"Downloading file: {api_url}{file_path}")

            response = requests.get(
                f'{api_url}{file_path}',
                timeout=30
            )
            response.raise_for_status()

            filename = file_path.split('/')[-1]
            file_content = base64.b64encode(response.content)

            if file_type == 'pdf':
                transcription.write({
                    'pdf_file': file_content,
                    'pdf_filename': filename
                })
            elif file_type == 'json':
                transcription.write({
                    'json_file': file_content,
                    'json_filename': filename
                })

            _logger.info(f"File {filename} stored successfully")
        except Exception as e:
            _logger.warning(f"Failed to download file {file_path}: {e}")
