from flask import Flask, render_template, request, jsonify
import numpy as np
from simulation import (
    simulate_ber, theoretical_ber, constellation_data,
    eye_diagram_data, waveform_data,
)

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/ber', methods=['POST'])
def api_ber():
    d = request.json
    mods = d.get('modulations', ['BPSK'])
    ch = d.get('channel', 'AWGN')
    coding = d.get('coding', 'none')
    snr = np.arange(
        d.get('snr_start', 0),
        d.get('snr_end', 20) + 0.1,
        d.get('snr_step', 1),
    ).tolist()
    n_bits = min(d.get('num_bits', 50000), 500000)
    if coding == 'conv':
        n_bits = min(n_bits, 5000)
    show_theo = d.get('show_theoretical', True)

    series = []
    for mod in mods:
        ber = simulate_ber(mod, snr, ch, coding, n_bits)
        series.append({'name': f'{mod} 仿真', 'ber': ber, 'type': 'sim'})
        if show_theo and coding == 'none':
            tb = theoretical_ber(mod, snr, ch)
            if any(v is not None for v in tb):
                series.append({'name': f'{mod} 理论', 'ber': tb, 'type': 'theo'})

    return jsonify({'snr': snr, 'series': series})


@app.route('/api/constellation', methods=['POST'])
def api_constellation():
    d = request.json
    return jsonify(constellation_data(
        d.get('modulation', 'QPSK'),
        d.get('snr', 10),
        d.get('channel', 'AWGN'),
    ))


@app.route('/api/eye', methods=['POST'])
def api_eye():
    d = request.json
    return jsonify(eye_diagram_data(
        d.get('modulation', 'BPSK'),
        d.get('snr', 10),
        d.get('channel', 'AWGN'),
    ))


@app.route('/api/waveform', methods=['POST'])
def api_waveform():
    d = request.json
    return jsonify(waveform_data(
        d.get('modulation', 'BPSK'),
        d.get('snr', 10),
        d.get('channel', 'AWGN'),
    ))


if __name__ == '__main__':
    app.run(debug=True, port=5000)
