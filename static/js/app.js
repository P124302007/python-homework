document.addEventListener('DOMContentLoaded', () => {

    /* ---- Tab switching ---- */
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        });
    });

    /* ---- Shared helpers ---- */
    const COLORS = {
        BPSK: '#2563eb', QPSK: '#dc2626', '8PSK': '#16a34a',
        '16QAM': '#9333ea', '64QAM': '#ea580c',
    };

    const BASE_LAYOUT = {
        font: { family: "-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif", size: 12 },
        paper_bgcolor: '#fff',
        plot_bgcolor: '#fff',
        margin: { t: 40, r: 24, b: 52, l: 60 },
    };
    const PLOT_CFG = { responsive: true, displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

    function show(id) { document.getElementById('loading-' + id).classList.add('show'); }
    function hide(id) { document.getElementById('loading-' + id).classList.remove('show'); }

    async function post(url, data) {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
    }

    function bindSlider(sliderId, valId) {
        const s = document.getElementById(sliderId);
        const v = document.getElementById(valId);
        s.addEventListener('input', () => { v.textContent = s.value; });
    }
    bindSlider('const-snr', 'const-snr-val');
    bindSlider('eye-snr', 'eye-snr-val');
    bindSlider('wf-snr', 'wf-snr-val');

    /* ---- BER Analysis ---- */
    document.getElementById('btn-ber').addEventListener('click', async () => {
        const mods = [...document.querySelectorAll('input[name="mod"]:checked')].map(e => e.value);
        if (!mods.length) return;

        const btn = document.getElementById('btn-ber');
        const coding = document.querySelector('input[name="ber-coding"]:checked').value;
        btn.disabled = true;
        const el = document.getElementById('loading-ber');
        el.textContent = coding === 'conv'
            ? '卷积编码仿真较慢，请耐心等待（约20~30秒）...'
            : '仿真计算中...';
        show('ber');

        try {
            const data = await post('/api/ber', {
                modulations: mods,
                channel: document.querySelector('input[name="ber-ch"]:checked').value,
                coding: document.querySelector('input[name="ber-coding"]:checked').value,
                snr_start: +document.getElementById('snr-start').value,
                snr_end: +document.getElementById('snr-end').value,
                snr_step: +document.getElementById('snr-step').value,
                num_bits: +document.getElementById('num-bits').value,
                show_theoretical: document.getElementById('show-theo').checked,
            });

            const traces = data.series.map(s => {
                const mod = s.name.split(' ')[0];
                const sim = s.type === 'sim';
                const tr = {
                    x: data.snr, y: s.ber,
                    name: s.name,
                    mode: sim ? 'lines+markers' : 'lines',
                    line: { color: COLORS[mod] || '#888', dash: sim ? 'solid' : 'dash', width: sim ? 2 : 1.5 },
                };
                if (sim) tr.marker = { size: 4 };
                return tr;
            });

            Plotly.newPlot('chart-ber', traces, {
                ...BASE_LAYOUT,
                title: { text: 'BER vs Eb/N₀', font: { size: 14 } },
                xaxis: { title: 'Eb/N₀ (dB)', gridcolor: '#eee', zeroline: false },
                yaxis: { title: 'BER', type: 'log', gridcolor: '#eee', zeroline: false, range: [-7, 0] },
                legend: { x: 1, xanchor: 'right', y: 1, font: { size: 11 } },
                hovermode: 'x unified',
            }, PLOT_CFG);
        } catch (e) {
            alert('仿真出错: ' + e.message);
        } finally {
            hide('ber');
            btn.disabled = false;
        }
    });

    /* ---- Constellation ---- */
    document.getElementById('btn-const').addEventListener('click', async () => {
        const mod = document.getElementById('const-mod').value;
        const ch = document.querySelector('input[name="const-ch"]:checked').value;
        const snr = +document.getElementById('const-snr').value;

        show('constellation');
        try {
            const d = await post('/api/constellation', { modulation: mod, snr, channel: ch });

            Plotly.newPlot('chart-constellation', [
                { x: d.tx_i, y: d.tx_q, mode: 'markers', name: '发送端',
                  marker: { size: 4, color: '#2563eb' }, xaxis: 'x', yaxis: 'y' },
                { x: d.rx_i, y: d.rx_q, mode: 'markers', name: '接收端',
                  marker: { size: 3, color: '#dc2626', opacity: 0.45 }, xaxis: 'x2', yaxis: 'y2' },
            ], {
                ...BASE_LAYOUT,
                grid: { rows: 1, columns: 2, pattern: 'independent' },
                xaxis:  { title: 'I', gridcolor: '#eee', zeroline: true, zerolinecolor: '#ccc',
                           scaleanchor: 'y', domain: [0, 0.46] },
                yaxis:  { title: 'Q', gridcolor: '#eee', zeroline: true, zerolinecolor: '#ccc' },
                xaxis2: { title: 'I', gridcolor: '#eee', zeroline: true, zerolinecolor: '#ccc',
                           scaleanchor: 'y2', domain: [0.54, 1] },
                yaxis2: { title: 'Q', gridcolor: '#eee', zeroline: true, zerolinecolor: '#ccc', anchor: 'x2' },
                showlegend: false,
                annotations: [
                    { text: '发送端', x: 0.23, y: 1.06, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 13 } },
                    { text: '接收端 (Eb/N₀=' + snr + ' dB, ' + ch + ')',
                      x: 0.77, y: 1.06, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 13 } },
                ],
            }, PLOT_CFG);
        } finally { hide('constellation'); }
    });

    /* ---- Eye Diagram ---- */
    document.getElementById('btn-eye').addEventListener('click', async () => {
        const mod = document.getElementById('eye-mod').value;
        const ch = document.querySelector('input[name="eye-ch"]:checked').value;
        const snr = +document.getElementById('eye-snr').value;

        show('eye');
        try {
            const d = await post('/api/eye', { modulation: mod, snr, channel: ch });

            const traces = d.traces.map(tr => ({
                x: d.t, y: tr, mode: 'lines',
                line: { color: '#2563eb', width: 0.6 },
                opacity: 0.25, showlegend: false, hoverinfo: 'skip',
            }));

            Plotly.newPlot('chart-eye', traces, {
                ...BASE_LAYOUT,
                title: { text: mod + ' 眼图 (Eb/N₀=' + snr + ' dB, ' + ch + ')', font: { size: 14 } },
                xaxis: { title: '时间 (符号周期)', gridcolor: '#eee' },
                yaxis: { title: '幅度', gridcolor: '#eee' },
                showlegend: false,
            }, PLOT_CFG);
        } finally { hide('eye'); }
    });

    /* ---- Waveform ---- */
    document.getElementById('btn-wf').addEventListener('click', async () => {
        const mod = document.getElementById('wf-mod').value;
        const ch = document.querySelector('input[name="wf-ch"]:checked').value;
        const snr = +document.getElementById('wf-snr').value;

        show('waveform');
        try {
            const d = await post('/api/waveform', { modulation: mod, snr, channel: ch });

            Plotly.newPlot('chart-waveform', [
                { x: d.time, y: d.tx_i, name: '发送 I', line: { color: '#2563eb', width: 1.5 }, xaxis: 'x', yaxis: 'y' },
                { x: d.time, y: d.rx_i, name: '接收 I', line: { color: '#dc2626', width: 1 }, xaxis: 'x', yaxis: 'y' },
                { x: d.freq, y: d.tx_spec, name: '发送 PSD', line: { color: '#2563eb', width: 1.5 }, xaxis: 'x2', yaxis: 'y2' },
                { x: d.freq, y: d.rx_spec, name: '接收 PSD', line: { color: '#dc2626', width: 1 }, xaxis: 'x2', yaxis: 'y2' },
            ], {
                ...BASE_LAYOUT,
                grid: { rows: 2, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
                xaxis:  { title: '时间 (符号周期)', gridcolor: '#eee' },
                yaxis:  { title: '幅度 (I)', gridcolor: '#eee' },
                xaxis2: { title: '归一化频率', gridcolor: '#eee' },
                yaxis2: { title: 'PSD (dB)', gridcolor: '#eee' },
                legend: { x: 1, xanchor: 'right', y: 1, font: { size: 11 } },
                height: 640,
            }, PLOT_CFG);
        } finally { hide('waveform'); }
    });

});
