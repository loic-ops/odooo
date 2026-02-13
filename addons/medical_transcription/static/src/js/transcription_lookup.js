/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class TranscriptionLookup extends Component {
    static template = "medical_transcription.TranscriptionLookup";

    setup() {
        this.rpc = useService("rpc");
        this.notification = useService("notification");
        this.state = useState({
            apiTranscriptionId: '',
            isLoading: false,
            error: null,
            result: null,
        });
    }

    onIdInput(ev) {
        this.state.apiTranscriptionId = ev.target.value;
    }

    onIdKeypress(ev) {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            this.onLookup();
        }
    }

    async onLookup() {
        const id = this.state.apiTranscriptionId.trim();
        if (!id) {
            this.notification.add("Veuillez saisir un ID de transcription", { type: 'warning' });
            return;
        }
        this.state.isLoading = true;
        this.state.error = null;
        this.state.result = null;
        try {
            const result = await this.rpc('/medical_transcription/lookup', {
                api_transcription_id: id
            });
            if (result.success) {
                this.state.result = result;
            } else {
                this.state.error = result.error || 'Transcription non trouvee';
            }
        } catch (e) {
            this.state.error = e.message || e.data?.message || 'Erreur de connexion';
        } finally {
            this.state.isLoading = false;
        }
    }

    onReset() {
        this.state.apiTranscriptionId = '';
        this.state.isLoading = false;
        this.state.error = null;
        this.state.result = null;
    }

    formatFieldName(key) {
        return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    formatTimestamp(ts) {
        if (!ts) return '-';
        return new Date(ts * 1000).toLocaleString('fr-FR');
    }

    getPatientInfoEntries() {
        const data = this.state.result?.patient_info || {};
        return Object.entries(data);
    }

    getPatientInfoJson() {
        const data = this.state.result?.patient_info || {};
        return JSON.stringify(data, null, 4);
    }

    getRequestedFieldEntries() {
        const data = this.state.result?.requested_fields || {};
        return Object.entries(data);
    }

    getRequestedFieldsJson() {
        const data = this.state.result?.requested_fields || {};
        return JSON.stringify(data, null, 4);
    }

    getAdditionalFieldEntries() {
        const data = this.state.result?.additional_fields || {};
        return Object.entries(data);
    }

    getAdditionalFieldsJson() {
        const data = this.state.result?.additional_fields || {};
        return JSON.stringify(data, null, 4);
    }

    getMetadataEntries() {
        const data = this.state.result?.metadata || {};
        return Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    }

    getMetadataJson() {
        const data = this.state.result?.metadata || {};
        return JSON.stringify(data, null, 4);
    }

    getFileEntries() {
        const data = this.state.result?.files || {};
        return Object.entries(data);
    }

    getValidatedDataEntries() {
        const data = this.state.result?.validated_data || {};
        return Object.entries(data);
    }

    getValidatedDataJson() {
        const data = this.state.result?.validated_data || {};
        return JSON.stringify(data, null, 4);
    }

    isValidated() {
        const r = this.state.result;
        if (!r) return false;
        if (r.validated === true || r.validated === 'true' || r.validated === 1 || r.validated === '1') return true;
        if (r.validated_data && typeof r.validated_data === 'object' && Object.keys(r.validated_data).length > 0) return true;
        if (r.validated_at) return true;
        return false;
    }
}

registry.category("actions").add(
    "medical_transcription.transcription_lookup",
    TranscriptionLookup
);
