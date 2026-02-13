/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { AudioRecorder } from "./audio_recorder";
import { DynamicFormEditor } from "./dynamic_form_editor";

export class MedicalTranscriptionAction extends Component {
    static template = "medical_transcription.TranscriptionAction";
    static components = { AudioRecorder, DynamicFormEditor };

    setup() {
        this.rpc = useService("rpc");
        this.orm = useService("orm");
        this.notification = useService("notification");

        this.state = useState({
            step: 'select',  // select, record, transcribing, review, validated
            templates: [],
            selectedTemplate: null,
            audioData: null,
            audioFilename: null,
            transcriptionId: null,
            extractedData: {},
            templateFields: [],
            medicalReport: '',
            whisperTranscription: '',
            showRawTranscription: false,
            reportEditMode: false,
            isLoading: false,
            error: null,
            debugLog: [],  // For debugging
            customFields: [],  // Custom fields added by doctor
            newCustomField: ''  // Input for new custom field
        });

        onWillStart(async () => {
            await this.loadTemplates();
        });
    }

    log(message) {
        console.log(`[MedicalTranscription] ${message}`);
        this.state.debugLog = [...this.state.debugLog, `${new Date().toISOString()}: ${message}`];
    }

    async loadTemplates() {
        try {
            this.state.isLoading = true;
            this.state.error = null;
            this.log("Loading templates...");

            const result = await this.rpc('/medical_transcription/templates', {});
            this.log(`Templates response: ${JSON.stringify(result).substring(0, 200)}`);

            if (result.success) {
                this.state.templates = result.templates || [];
                this.log(`Loaded ${this.state.templates.length} templates`);
            } else {
                this.state.error = result.error || 'Failed to load templates';
                this.log(`Error: ${this.state.error}`);
            }
        } catch (e) {
            const errorMsg = e.message || e.data?.message || JSON.stringify(e);
            this.state.error = `Connection error: ${errorMsg}. Check API URL in settings.`;
            this.log(`Exception: ${errorMsg}`);
            console.error("Load templates error:", e);
        } finally {
            this.state.isLoading = false;
        }
    }

    onTemplateSelect(ev) {
        const templateType = ev.target.value;
        if (!templateType) {
            this.state.selectedTemplate = null;
            return;
        }
        const template = this.state.templates.find(t => t.type === templateType);
        this.state.selectedTemplate = template;
        // Combine template fields with custom fields
        const baseFields = template ? (template.fields || []) : [];
        const customFieldObjects = this.state.customFields.map(f => ({
            key: f.toLowerCase().replace(/\s+/g, '_'),
            label: f,
            required: false
        }));
        this.state.templateFields = [...baseFields, ...customFieldObjects];
        this.state.step = 'record';
        this.state.error = null;
        this.log(`Selected template: ${templateType} with ${this.state.customFields.length} custom fields`);
    }

    onCustomFieldInput(ev) {
        this.state.newCustomField = ev.target.value;
    }

    onCustomFieldKeypress(ev) {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            this.addCustomField();
        }
    }

    addCustomField() {
        const fieldName = this.state.newCustomField.trim();
        if (fieldName && !this.state.customFields.includes(fieldName)) {
            this.state.customFields = [...this.state.customFields, fieldName];
            this.state.newCustomField = '';
            this.log(`Added custom field: ${fieldName}`);
        }
    }

    removeCustomField(fieldName) {
        this.state.customFields = this.state.customFields.filter(f => f !== fieldName);
        this.log(`Removed custom field: ${fieldName}`);
    }

    onAudioReady(audioData, filename) {
        this.state.audioData = audioData;
        this.state.audioFilename = filename;
        if (audioData) {
            this.log(`Audio ready: ${filename}, size: ${audioData.length} chars (base64)`);
        } else {
            this.log("Audio cleared");
        }
    }

    async onTranscribe() {
        if (!this.state.audioData || !this.state.selectedTemplate) {
            this.notification.add("Please select a template and provide audio", {
                type: 'warning'
            });
            return;
        }

        this.state.step = 'transcribing';
        this.state.isLoading = true;
        this.state.error = null;
        this.log("Starting transcription...");

        // Step 1: Create record
        let transcriptionId = null;
        try {
            this.log("Step 1: Creating transcription record...");
            const createData = {
                template_type: this.state.selectedTemplate.type,
                template_name: this.state.selectedTemplate.display_name || this.state.selectedTemplate.type,
                audio_file: this.state.audioData,
                audio_filename: this.state.audioFilename,
                template_fields_json: JSON.stringify(this.state.templateFields || []),
                state: 'transcribing'
            };
            this.log(`Create data keys: ${Object.keys(createData).join(', ')}`);

            const createResult = await this.orm.create('medical.transcription', [createData]);
            this.log(`Create result type: ${typeof createResult}, value: ${JSON.stringify(createResult)}`);

            // Handle different possible return formats
            if (Array.isArray(createResult)) {
                transcriptionId = createResult[0];
            } else if (typeof createResult === 'number') {
                transcriptionId = createResult;
            } else if (createResult && createResult.id) {
                transcriptionId = createResult.id;
            } else {
                transcriptionId = createResult;
            }

            this.state.transcriptionId = transcriptionId;
            this.log(`Record created with ID: ${transcriptionId}`);

            if (!transcriptionId) {
                throw new Error(`Invalid transcription ID: ${transcriptionId}`);
            }
        } catch (e) {
            const errorMsg = e.message || e.data?.message || JSON.stringify(e);
            this.state.error = `Failed to create record: ${errorMsg}`;
            this.state.step = 'record';
            this.state.isLoading = false;
            this.log(`CREATE ERROR: ${errorMsg}`);
            console.error("Create record error:", e);
            return;
        }

        // Step 2: Call transcription API
        try {
            this.log("Step 2: Calling transcription API...");
            const apiParams = {
                transcription_id: transcriptionId,
                audio_base64: this.state.audioData,
                audio_filename: this.state.audioFilename,
                template_type: this.state.selectedTemplate.type,
                template_fields: this.state.templateFields || []
            };
            this.log(`API params: transcription_id=${transcriptionId}, filename=${this.state.audioFilename}, type=${this.state.selectedTemplate.type}, fields=${this.state.templateFields?.length || 0}`);

            const result = await this.rpc('/medical_transcription/transcribe', apiParams);
            this.log(`API response success: ${result.success}`);

            if (result.success) {
                this.state.extractedData = result.extracted_data || {};
                this.state.medicalReport = result.medical_report || '';
                this.state.whisperTranscription = result.whisper_transcription || '';

                if (result.template && result.template.fields) {
                    this.state.templateFields = result.template.fields;
                }

                this.state.step = 'review';
                this.log("Transcription successful!");
                this.notification.add("Transcription completed successfully!", {
                    type: 'success'
                });
            } else {
                this.state.error = result.error || 'Transcription failed (unknown reason)';
                this.state.step = 'record';
                this.log(`API returned error: ${this.state.error}`);
            }
        } catch (e) {
            const errorMsg = e.message || e.data?.message || JSON.stringify(e);
            this.state.error = `API Error: ${errorMsg}`;
            this.state.step = 'record';
            this.log(`API EXCEPTION: ${errorMsg}`);
            console.error("Transcription API error:", e);
        } finally {
            this.state.isLoading = false;
        }
    }

    onFieldChange(fieldKey, value) {
        this.state.extractedData = {
            ...this.state.extractedData,
            [fieldKey]: value
        };
    }

    onReportChange(ev) {
        this.state.medicalReport = ev.target.value;
    }

    toggleRawTranscription() {
        this.state.showRawTranscription = !this.state.showRawTranscription;
    }

    toggleReportEditMode() {
        this.state.reportEditMode = !this.state.reportEditMode;
    }

    // Fields that belong to "INFORMATIONS CLINIQUES" (patient identity)
    static PATIENT_INFO_KEYS = [
        'nom', 'prenom', 'age', 'sexe', 'date_de_naissance',
        'numero_securite_sociale', 'adresse', 'telephone',
        'histoire_de_la_maladie', 'antecedents',
        'allergies', 'profession', 'situation_familiale',
        'motif_de_consultation', 'motif',
    ];

    static FIELD_LABELS = {
        'atcd': 'Antecedents',
        'antecedents': 'Antecedents',
        'hdm': 'Histoire De La Maladie',
        'histoire_de_la_maladie': 'Histoire De La Maladie',
        'mdc': 'Motif De Consultation',
        'motif_de_consultation': 'Motif De Consultation',
        'motif': 'Motif',
        'derniere_rgle': 'Derniere Regle',
        'derniere_regle': 'Derniere Regle',
        'resume_syndromique': 'Resume Syndromique',
        'hypotheses_diagnostiques': 'Hypotheses Diagnostiques',
        'examen_physique': 'Examen Physique',
        'examens_paracliniques': 'Examens Paracliniques',
        'autre_examen': 'Autre Examen',
        'nom': 'Nom',
        'prenom': 'Prenom',
        'age': 'Age',
        'sexe': 'Sexe',
        'date_de_naissance': 'Date De Naissance',
        'numero_securite_sociale': 'Numero Securite Sociale',
        'adresse': 'Adresse',
        'telephone': 'Telephone',
        'allergies': 'Allergies',
        'profession': 'Profession',
        'situation_familiale': 'Situation Familiale',
        'commentaires': 'Commentaires',
    };

    formatFieldName(key) {
        const label = MedicalTranscriptionAction.FIELD_LABELS[key.toLowerCase()];
        if (label) return label;
        return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    getPatientInfoEntries() {
        const data = this.state.extractedData || {};
        const infoKeys = MedicalTranscriptionAction.PATIENT_INFO_KEYS;
        return Object.keys(data)
            .filter(k => infoKeys.includes(k.toLowerCase()))
            .map(k => [k, data[k]]);
    }

    getClinicalDataEntries() {
        const data = this.state.extractedData || {};
        const infoKeys = MedicalTranscriptionAction.PATIENT_INFO_KEYS;
        return Object.keys(data)
            .filter(k => !infoKeys.includes(k.toLowerCase()))
            .map(k => [k, data[k]]);
    }

    getCurrentDate() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        return `${day}/${month}/${year}`;
    }

    getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    async onValidate() {
        try {
            this.state.isLoading = true;
            this.state.error = null;
            this.log("Validating transcription...");

            const result = await this.rpc('/medical_transcription/validate', {
                transcription_id: this.state.transcriptionId,
                validated_data: this.state.extractedData,
                validated_report: this.state.medicalReport
            });

            if (result.success) {
                this.state.step = 'validated';
                this.log("Validation successful!");
                this.notification.add("Transcription validated successfully!", {
                    type: 'success'
                });
            } else {
                this.state.error = result.error || 'Validation failed';
                this.log(`Validation error: ${this.state.error}`);
            }

        } catch (e) {
            const errorMsg = e.message || e.data?.message || JSON.stringify(e);
            this.state.error = `Error: ${errorMsg}`;
            this.log(`Validation exception: ${errorMsg}`);
            console.error("Validation error:", e);
        } finally {
            this.state.isLoading = false;
        }
    }

    onDownloadPdf() {
        // Use Odoo's built-in QWeb PDF report
        window.open(
            `/medical_transcription/report/${this.state.transcriptionId}`,
            '_blank'
        );
    }

    onDownloadJson() {
        window.open(
            `/medical_transcription/download/${this.state.transcriptionId}/json`,
            '_blank'
        );
    }

    onReset() {
        this.state.step = 'select';
        this.state.selectedTemplate = null;
        this.state.audioData = null;
        this.state.audioFilename = null;
        this.state.transcriptionId = null;
        this.state.extractedData = {};
        this.state.templateFields = [];
        this.state.medicalReport = '';
        this.state.whisperTranscription = '';
        this.state.showRawTranscription = false;
        this.state.reportEditMode = false;
        this.state.error = null;
        this.state.debugLog = [];
        this.state.customFields = [];
        this.state.newCustomField = '';
        this.log("Reset complete");
    }

    onBackToRecord() {
        this.state.step = 'record';
        this.state.error = null;
    }
}

registry.category("actions").add(
    "medical_transcription.transcription_action",
    MedicalTranscriptionAction
);
