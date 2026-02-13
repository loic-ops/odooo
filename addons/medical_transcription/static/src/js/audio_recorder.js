/** @odoo-module **/

import { Component, useState, onWillUnmount } from "@odoo/owl";

export class AudioRecorder extends Component {
    static template = "medical_transcription.AudioRecorder";
    static props = {
        onAudioReady: { type: Function }
    };

    setup() {
        this.state = useState({
            isRecording: false,
            hasRecording: false,
            recordingTime: 0,
            audioUrl: null,
            filename: null,
            error: null
        });

        this.mediaRecorder = null;
        this.audioChunks = [];
        this.timerInterval = null;

        onWillUnmount(() => {
            this.cleanup();
        });
    }

    async startRecording() {
        try {
            this.state.error = null;
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: this.getSupportedMimeType()
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            this.mediaRecorder.start();
            this.state.isRecording = true;
            this.state.recordingTime = 0;

            this.timerInterval = setInterval(() => {
                this.state.recordingTime++;
            }, 1000);

        } catch (e) {
            this.state.error = "Microphone access denied or not available";
            console.error("Recording error:", e);
        }
    }

    getSupportedMimeType() {
        const types = [
            'audio/webm',
            'audio/mp4',
            'audio/ogg',
            'audio/wav'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return 'audio/webm';
    }

    stopRecording() {
        if (this.mediaRecorder && this.state.isRecording) {
            this.mediaRecorder.stop();
            this.state.isRecording = false;

            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }

            // Stop all tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    processRecording() {
        const mimeType = this.mediaRecorder.mimeType;
        const extension = mimeType.split('/')[1].split(';')[0];
        const blob = new Blob(this.audioChunks, { type: mimeType });

        this.state.audioUrl = URL.createObjectURL(blob);
        this.state.filename = `recording_${Date.now()}.${extension}`;
        this.state.hasRecording = true;

        // Convert to base64 and notify parent
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            this.props.onAudioReady(base64, this.state.filename);
        };
        reader.readAsDataURL(blob);
    }

    onFileImport(ev) {
        const file = ev.target.files[0];
        if (!file) return;

        // Reset file input for re-upload
        ev.target.value = '';

        const validExtensions = ['mp3', 'mpeg', 'wav', 'm4a', 'webm', 'ogg', 'mp4', 'flac', 'aac'];
        const fileExtension = file.name.split('.').pop().toLowerCase();

        if (!validExtensions.includes(fileExtension)) {
            this.state.error = "Invalid audio format. Supported: mp3, wav, m4a, webm, ogg, flac, aac";
            return;
        }

        this.state.error = null;
        this.state.audioUrl = URL.createObjectURL(file);
        this.state.filename = file.name;
        this.state.hasRecording = true;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            this.props.onAudioReady(base64, file.name);
        };
        reader.readAsDataURL(file);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    clearRecording() {
        if (this.state.audioUrl) {
            URL.revokeObjectURL(this.state.audioUrl);
        }
        this.state.audioUrl = null;
        this.state.filename = null;
        this.state.hasRecording = false;
        this.state.recordingTime = 0;
        this.props.onAudioReady(null, null);
    }

    cleanup() {
        this.stopRecording();
        if (this.state.audioUrl) {
            URL.revokeObjectURL(this.state.audioUrl);
        }
    }
}
