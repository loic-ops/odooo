/** @odoo-module **/

import { Component } from "@odoo/owl";

export class DynamicFormEditor extends Component {
    static template = "medical_transcription.DynamicFormEditor";
    static props = {
        fields: { type: Array },
        values: { type: Object },
        onFieldChange: { type: Function },
        readonly: { type: Boolean, optional: true }
    };

    static defaultProps = {
        readonly: false
    };

    onInputChange(fieldKey, ev) {
        this.props.onFieldChange(fieldKey, ev.target.value);
    }

    getFieldValue(fieldKey) {
        return this.props.values[fieldKey] || '';
    }
}
